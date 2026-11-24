using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenCaveMap.Api.Data;
using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Tests;

public class SegmentsApiTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> webFactory = TestApi.Configure(factory);

    [Fact]
    public async Task NewSegment_IsNumberOneWithTwoBlankStationsAndOneBlankShot_ForAProjectsFirstSegment()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);

        var segment = await GetJsonAsync(client, $"/api/projects/{projectId}/segments/new");

        AssertJson(
            """
            {
              "id": null, "number": 1, "surveyDate": null, "name": null, "note": null,
              "stations": [
                { "id": null, "label": "1.0", "depth": "", "note": null },
                { "id": null, "label": "1.1", "depth": "", "note": null }
              ],
              "shots": [
                { "id": null, "label": "1.1", "distance": "", "azimuth": "", "note": null }
              ]
            }
            """,
            segment);
    }

    [Fact]
    public async Task Create_ReturnsTheSavedSegment_WithIdsLabelsAndDisplayText()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", new
        {
            surveyDate = "2026-11-21",
            name = "  Main line upstream  ",
            note = "Good visibility",
            stations = new object[]
            {
                new { id = (int?)null, depth = "3", note = "Line arrow" },
                new { id = (int?)null, depth = " 12.50 ", note = "   " },
                new { id = (int?)null, depth = "0", note = (string?)null },
            },
            shots = new object[]
            {
                new { id = (int?)null, distance = "30.00", azimuth = "045", note = "Restriction" },
                new { id = (int?)null, distance = "8.125", azimuth = "359.5", note = (string?)null },
            },
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var segment = (await response.Content.ReadFromJsonAsync<JsonNode>())!;
        Assert.True((int)segment["id"]! > 0);
        foreach (var row in segment["stations"]!.AsArray().Concat(segment["shots"]!.AsArray()))
        {
            Assert.True((int)row!["id"]! > 0);
            row.AsObject().Remove("id");
        }

        segment.AsObject().Remove("id");
        AssertJson(
            """
            {
              "number": 1, "surveyDate": "2026-11-21", "name": "Main line upstream", "note": "Good visibility",
              "stations": [
                { "label": "1.0", "depth": "3", "note": "Line arrow" },
                { "label": "1.1", "depth": "12.5", "note": null },
                { "label": "1.2", "depth": "0", "note": null }
              ],
              "shots": [
                { "label": "1.1", "distance": "30", "azimuth": "45", "note": "Restriction" },
                { "label": "1.2", "distance": "8.13", "azimuth": "359.5", "note": null }
              ]
            }
            """,
            segment);
    }

    [Fact]
    public async Task Create_IssuesNumbersFromOneInCreationOrder_AndTheNextNewSegmentDefaultsToTheLastSurveyDate()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);

        var first = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var second = await CreateSegmentAsync(client, projectId, "2026-03-02");
        var next = await GetJsonAsync(client, $"/api/projects/{projectId}/segments/new");

        Assert.Equal(1, (int)first["number"]!);
        Assert.Equal(2, (int)second["number"]!);
        Assert.Equal(3, (int)next["number"]!);
        Assert.Equal("2026-03-02", (string?)next["surveyDate"]);
        Assert.Equal(["3.0", "3.1"], next["stations"]!.AsArray().Select(station => (string?)station!["label"]));
        Assert.Equal(["3.1"], next["shots"]!.AsArray().Select(shot => (string?)shot!["label"]));
    }

    [Fact]
    public async Task List_IsEmpty_ForANewProject()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);

        var segments = await GetJsonAsync(client, $"/api/projects/{projectId}/segments");

        AssertJson("[]", segments);
    }

    [Fact]
    public async Task List_IsNewestSurveyDateFirstThenHighestNumber_WithStationCountAndTotalLength()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var older = await CreateSegmentAsync(client, projectId, "2026-03-02", name: "Downstream", distances: ["10.004", "2.5"]);
        var sameDayFirst = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: ["30"]);
        var sameDaySecond = await CreateSegmentAsync(client, projectId, "2026-11-21", name: "Side passage", distances: ["4", "5", "6"]);

        var segments = await GetJsonAsync(client, $"/api/projects/{projectId}/segments");

        AssertJson(
            $$"""
            [
              { "id": {{sameDaySecond["id"]}}, "number": 3, "name": "Side passage", "surveyDate": "2026-11-21", "stationCount": 4, "totalLength": "15" },
              { "id": {{sameDayFirst["id"]}}, "number": 2, "name": null, "surveyDate": "2026-11-21", "stationCount": 2, "totalLength": "30" },
              { "id": {{older["id"]}}, "number": 1, "name": "Downstream", "surveyDate": "2026-03-02", "stationCount": 3, "totalLength": "12.5" }
            ]
            """,
            segments);
    }

    [Theory]
    [InlineData("surveyDate", null, "Survey date is required.")]
    [InlineData("surveyDate", " ", "Survey date is required.")]
    [InlineData("surveyDate", "2026-02-30", "Survey date must be a real date.")]
    [InlineData("surveyDate", "21/11/2026", "Survey date must be a real date.")]
    [InlineData("stations[1].depth", null, "Depth is required.")]
    [InlineData("stations[1].depth", "  ", "Depth is required.")]
    [InlineData("stations[1].depth", "deep", "Depth must be a number, such as 12.5.")]
    [InlineData("stations[1].depth", "1,000", "Depth must be a number, such as 12.5.")]
    [InlineData("stations[1].depth", "12,5", "Depth must be a number, such as 12.5.")]
    [InlineData("stations[1].depth", "1e3", "Depth must be a number, such as 12.5.")]
    [InlineData("stations[1].depth", "-0.5", "Depth must be zero or more.")]
    [InlineData("stations[1].depth", "100000", "Depth must be less than 100,000 m.")]
    [InlineData("stations[1].depth", "99999.9999999", "Depth must be less than 100,000 m.")]
    [InlineData("stations[1].depth", "123456789012345678901234567890", "Depth must be less than 100,000 m.")]
    [InlineData("shots[0].distance", null, "Distance is required.")]
    [InlineData("shots[0].distance", "x", "Distance must be a number, such as 12.5.")]
    [InlineData("shots[0].distance", "0", "Distance must be more than zero.")]
    [InlineData("shots[0].distance", "-3", "Distance must be more than zero.")]
    [InlineData("shots[0].distance", "100000", "Distance must be less than 100,000 m.")]
    [InlineData("shots[0].azimuth", "", "Azimuth is required.")]
    [InlineData("shots[0].azimuth", "N", "Azimuth must be a number, such as 12.5.")]
    [InlineData("shots[0].azimuth", "-1", "Azimuth must be from 0 to 360.")]
    [InlineData("shots[0].azimuth", "360.5", "Azimuth must be from 0 to 360.")]
    public async Task Create_RejectsAnInvalidField_WithAMessageKeyedByThatField(string path, string? value, string message)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, path, value);

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        await AssertValidationErrorsAsync(response, new() { [path] = [message] });
    }

    [Theory]
    [InlineData("name", 201, "Name must be 200 characters or fewer.")]
    [InlineData("note", 2001, "Note must be 2000 characters or fewer.")]
    [InlineData("stations[0].note", 501, "Note must be 500 characters or fewer.")]
    [InlineData("shots[0].note", 501, "Note must be 500 characters or fewer.")]
    public async Task Create_RejectsTextThatIsTooLong(string path, int length, string message)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, path, new string('a', length));

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        await AssertValidationErrorsAsync(response, new() { [path] = [message] });
    }

    [Theory]
    [InlineData("name", 200)]
    [InlineData("note", 2000)]
    [InlineData("stations[0].note", 500)]
    [InlineData("shots[0].note", 500)]
    public async Task Create_AcceptsTextAtTheLimit_IgnoringSurroundingSpaces(string path, int length)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, path, $"  {new string('a', length)}  ");

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Create_RejectsFewerThanTwoStations()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        body["stations"] = new JsonArray(new JsonObject { ["depth"] = "3" });
        body["shots"] = new JsonArray();

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        await AssertValidationErrorsAsync(response, new() { ["stations"] = ["A segment needs at least two stations."] });
    }

    [Theory]
    [InlineData(0)]
    [InlineData(2)]
    public async Task Create_RejectsAnyNumberOfShotsButOneFewerThanTheStations(int shotCount)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        body["shots"] = new JsonArray([.. Enumerable.Range(0, shotCount)
            .Select(_ => new JsonObject { ["distance"] = "5", ["azimuth"] = "90" })]);

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        await AssertValidationErrorsAsync(
            response, new() { ["shots"] = ["A segment needs exactly one fewer shot than it has stations."] });
    }

    [Fact]
    public async Task Create_ReportsEveryProblemAtOnce_AndSavesNothing()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, "surveyDate", null);
        SetField(body, "stations[0].depth", "");
        SetField(body, "shots[0].azimuth", "400");

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        await AssertValidationErrorsAsync(response, new()
        {
            ["surveyDate"] = ["Survey date is required."],
            ["stations[0].depth"] = ["Depth is required."],
            ["shots[0].azimuth"] = ["Azimuth must be from 0 to 360."],
        });
        AssertJson("[]", await GetJsonAsync(client, $"/api/projects/{projectId}/segments"));
        Assert.Equal(1, (int)(await GetJsonAsync(client, $"/api/projects/{projectId}/segments/new"))["number"]!);
    }

    [Theory]
    [InlineData("stations[0].depth", "0", "0")]
    [InlineData("stations[0].depth", " 045 ", "45")]
    [InlineData("stations[0].depth", "07.50", "7.5")]
    [InlineData("stations[0].depth", ".5", "0.5")]
    [InlineData("stations[0].depth", "12.", "12")]
    [InlineData("stations[0].depth", "1.005", "1.01")]
    [InlineData("stations[0].depth", "99999.99", "99999.99")]
    [InlineData("shots[0].distance", "0.25", "0.25")]
    [InlineData("shots[0].distance", "9.144", "9.14")]
    [InlineData("shots[0].azimuth", "0", "0")]
    [InlineData("shots[0].azimuth", "045", "45")]
    [InlineData("shots[0].azimuth", "12.3450", "12.345")]
    [InlineData("shots[0].azimuth", "12.3456", "12.346")]
    [InlineData("shots[0].azimuth", "360", "0")]
    [InlineData("shots[0].azimuth", "359.9999", "0")]
    public async Task Create_AcceptsAReading_AndReturnsItsDisplayText(string path, string value, string displayed)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, path, value);

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var segment = await response.Content.ReadFromJsonAsync<JsonNode>();
        Assert.Equal(displayed, (string?)GetField(segment!, path));
    }

    [Fact]
    public async Task Create_StoresBlankNamesAndNotesAsAbsent()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, "name", "   ");
        SetField(body, "note", "");
        SetField(body, "shots[0].note", " \t ");

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        var segment = (await response.Content.ReadFromJsonAsync<JsonNode>())!;
        Assert.Null(segment["name"]);
        Assert.Null(segment["note"]);
        Assert.Null(segment["shots"]![0]!["note"]);
    }

    [Fact]
    public async Task Create_GivesTheAddressOfTheSegment_WhichGetReturnsAsSaved()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, "stations[0].note", "Line arrow");
        SetField(body, "shots[0].note", "Restriction");

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);
        var created = await response.Content.ReadFromJsonAsync<JsonNode>();

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal($"/api/projects/{projectId}/segments/{created!["id"]}", response.Headers.Location?.AbsolutePath);
        AssertJson(created.ToJsonString(), await GetJsonAsync(client, response.Headers.Location!.ToString()));
    }

    [Fact]
    public async Task Get_ReturnsTheSegment_WithIdsLabelsDisplayTextAndNotes()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var created = await CreateSegmentAsync(client, projectId, "2026-11-21", name: "Main line", distances: ["8.125", "4"]);

        var segment = await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{created["id"]}");

        AssertJson(
            $$"""
            {
              "id": {{created["id"]}}, "number": 1, "surveyDate": "2026-11-21", "name": "Main line", "note": null,
              "stations": [
                { "id": {{created["stations"]![0]!["id"]}}, "label": "1.0", "depth": "10", "note": null },
                { "id": {{created["stations"]![1]!["id"]}}, "label": "1.1", "depth": "10", "note": null },
                { "id": {{created["stations"]![2]!["id"]}}, "label": "1.2", "depth": "10", "note": null }
              ],
              "shots": [
                { "id": {{created["shots"]![0]!["id"]}}, "label": "1.1", "distance": "8.13", "azimuth": "90", "note": null },
                { "id": {{created["shots"]![1]!["id"]}}, "label": "1.2", "distance": "4", "azimuth": "90", "note": null }
              ]
            }
            """,
            segment);
    }

    [Fact]
    public async Task Get_IsNotFound_ForAnUnknownSegment_OrOneInAnotherProject()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var otherProjectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{projectId}/segments/999999")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.GetAsync($"/api/projects/{otherProjectId}/segments/{segment["id"]}")).StatusCode);
    }

    [Fact]
    public async Task Replace_StoresChangedReadingsNotesDateAndName_KeepingIdentitiesAndTheNumber()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        await CreateSegmentAsync(client, projectId, "2026-11-20");
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", name: "Main line");
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var body = segment.DeepClone();
        body["surveyDate"] = "2026-03-02";
        body["name"] = "  Upstream  ";
        body["note"] = "Silty";
        body["stations"]![1]!["depth"] = "21.5";
        body["stations"]![1]!["note"] = "Jump left";
        body["shots"]![0]!["distance"] = "7";
        body["shots"]![0]!["azimuth"] = "360";
        body["shots"]![0]!["note"] = "Restriction";

        var response = await client.PutAsJsonAsync(url, body);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var expected =
            $$"""
            {
              "id": {{segment["id"]}}, "number": 2, "surveyDate": "2026-03-02", "name": "Upstream", "note": "Silty",
              "stations": [
                { "id": {{segment["stations"]![0]!["id"]}}, "label": "2.0", "depth": "10", "note": null },
                { "id": {{segment["stations"]![1]!["id"]}}, "label": "2.1", "depth": "21.5", "note": "Jump left" }
              ],
              "shots": [
                { "id": {{segment["shots"]![0]!["id"]}}, "label": "2.1", "distance": "7", "azimuth": "0", "note": "Restriction" }
              ]
            }
            """;
        AssertJson(expected, await response.Content.ReadFromJsonAsync<JsonNode>());
        AssertJson(expected, await GetJsonAsync(client, url));
        var listed = (await GetJsonAsync(client, $"/api/projects/{projectId}/segments")).AsArray();
        Assert.Equal(["2026-11-20", "2026-03-02"], listed.Select(row => (string?)row!["surveyDate"]));
        Assert.Equal("7", (string?)listed[1]!["totalLength"]);
    }

    [Fact]
    public async Task Replace_AddingAShotAndStationAtTheEnd_GivesThemNewIdentitiesAndTheNextLabels()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var body = segment.DeepClone();
        body["stations"]!.AsArray().Add(new JsonObject { ["id"] = null, ["depth"] = "4", ["note"] = "Sump" });
        body["shots"]!.AsArray().Add(new JsonObject { ["id"] = null, ["distance"] = "6", ["azimuth"] = "180", ["note"] = null });

        var saved = await PutJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}", body);

        Assert.Equal(["1.0", "1.1", "1.2"], Labels(saved["stations"]));
        Assert.Equal(["1.1", "1.2"], Labels(saved["shots"]));
        Assert.Equal(Ids(segment["stations"]), Ids(saved["stations"]).Take(2));
        Assert.Equal(Ids(segment["shots"]), Ids(saved["shots"]).Take(1));
        Assert.DoesNotContain((int)saved["stations"]![2]!["id"]!, Ids(segment["stations"]));
        Assert.Equal("Sump", (string?)saved["stations"]![2]!["note"]);
        Assert.Equal("180", (string?)saved["shots"]![1]!["azimuth"]);
    }

    [Fact]
    public async Task Replace_OmittingAStationAndItsShot_RenumbersTheRest_AndNotesStayWithTheirRows()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: ["1", "2", "3"]);
        var body = segment.DeepClone();
        body["stations"]![2]!["note"] = "Line arrow";
        body["shots"]![2]!["note"] = "Restriction";
        // Removes station 1.1 and the shot arriving at it.
        body["stations"]!.AsArray().RemoveAt(1);
        body["shots"]!.AsArray().RemoveAt(0);

        var saved = await PutJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}", body);

        Assert.Equal(["1.0", "1.1", "1.2"], Labels(saved["stations"]));
        Assert.Equal(["1.1", "1.2"], Labels(saved["shots"]));
        Assert.Equal(
            [(int)segment["stations"]![0]!["id"]!, (int)segment["stations"]![2]!["id"]!, (int)segment["stations"]![3]!["id"]!],
            Ids(saved["stations"]));
        Assert.Equal([(int)segment["shots"]![1]!["id"]!, (int)segment["shots"]![2]!["id"]!], Ids(saved["shots"]));
        Assert.Equal([null, "Line arrow", null], saved["stations"]!.AsArray().Select(row => (string?)row!["note"]));
        Assert.Equal(["2", "3"], saved["shots"]!.AsArray().Select(row => (string?)row!["distance"]));
        Assert.Equal([null, "Restriction"], saved["shots"]!.AsArray().Select(row => (string?)row!["note"]));
        AssertJson(saved.ToJsonString(), await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}"));
    }

    [Fact]
    public async Task Replace_AddingAStationInTheMiddle_RenumbersTheRest_AndNotesStayWithTheirRows()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: ["1", "2"]);
        var body = segment.DeepClone();
        body["stations"]![1]!["note"] = "Jump left";
        body["shots"]![1]!["note"] = "Restriction";
        // Inserts a station after 1.0, with the shot arriving at it.
        body["stations"]!.AsArray().Insert(1, new JsonObject { ["id"] = null, ["depth"] = "11", ["note"] = "Missed" });
        body["shots"]!.AsArray().Insert(0, new JsonObject { ["id"] = null, ["distance"] = "0.5", ["azimuth"] = "10", ["note"] = null });

        var saved = await PutJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}", body);

        Assert.Equal(["1.0", "1.1", "1.2", "1.3"], Labels(saved["stations"]));
        Assert.Equal(["1.1", "1.2", "1.3"], Labels(saved["shots"]));
        Assert.Equal((int)segment["stations"]![1]!["id"]!, (int)saved["stations"]![2]!["id"]!);
        Assert.Equal((int)segment["shots"]![0]!["id"]!, (int)saved["shots"]![1]!["id"]!);
        Assert.Equal([null, "Missed", "Jump left", null], saved["stations"]!.AsArray().Select(row => (string?)row!["note"]));
        Assert.Equal(["0.5", "1", "2"], saved["shots"]!.AsArray().Select(row => (string?)row!["distance"]));
        Assert.Equal([null, null, "Restriction"], saved["shots"]!.AsArray().Select(row => (string?)row!["note"]));
        AssertJson(saved.ToJsonString(), await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}"));
    }

    [Theory]
    [InlineData("surveyDate", "2026-02-30", "Survey date must be a real date.")]
    [InlineData("stations[1].depth", "", "Depth is required.")]
    [InlineData("stations[1].depth", "-0.5", "Depth must be zero or more.")]
    [InlineData("shots[0].distance", "0", "Distance must be more than zero.")]
    [InlineData("shots[0].azimuth", "N", "Azimuth must be a number, such as 12.5.")]
    public async Task Replace_RejectsAnInvalidField_WithAMessageKeyedByThatField_AndChangesNothing(
        string path, string value, string message)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var body = (JsonObject)segment.DeepClone();
        body["name"] = "Changed";
        SetField(body, path, value);

        var response = await client.PutAsJsonAsync(url, body);

        await AssertValidationErrorsAsync(response, new() { [path] = [message] });
        AssertJson(segment.ToJsonString(), await GetJsonAsync(client, url));
    }

    [Fact]
    public async Task Replace_RejectsTheWrongNumberOfStationsAndShots()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var body = segment.DeepClone();
        body["stations"]!.AsArray().RemoveAt(1);

        var response = await client.PutAsJsonAsync($"/api/projects/{projectId}/segments/{segment["id"]}", body);

        await AssertValidationErrorsAsync(response, new()
        {
            ["stations"] = ["A segment needs at least two stations."],
            ["shots"] = ["A segment needs exactly one fewer shot than it has stations."],
        });
    }

    [Fact]
    public async Task Replace_RejectsIdentitiesFromOutsideTheSegment_AndIdentitiesThatRepeat_AndChangesNothing()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: ["1", "2"]);
        var other = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var body = segment.DeepClone();
        body["stations"]![1]!["id"] = (int)other["stations"]![1]!["id"]!;
        body["stations"]![2]!["id"] = (int)segment["stations"]![0]!["id"]!;
        body["shots"]![0]!["id"] = (int)other["shots"]![0]!["id"]!;
        body["shots"]![1]!["id"] = 999999;

        var response = await client.PutAsJsonAsync(url, body);

        await AssertValidationErrorsAsync(response, new()
        {
            ["stations[1].id"] = ["This station isn't part of the segment."],
            ["stations[2].id"] = ["This station appears more than once."],
            ["shots[0].id"] = ["This shot isn't part of the segment."],
            ["shots[1].id"] = ["This shot isn't part of the segment."],
        });
        AssertJson(segment.ToJsonString(), await GetJsonAsync(client, url));
    }

    // The API only shows rounded distances, so the total length is how these tests see what is stored: four shots of
    // 1.004 each show as 1, but together they're 4.016, which shows as 4.02.
    [Fact]
    public async Task Replace_KeepsAStoredDistance_WhenItIsSentBackAsShown()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: ["1.004", "1.004", "1.004", "1.004"]);
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        Assert.Equal(["1", "1", "1", "1"], segment["shots"]!.AsArray().Select(row => (string?)row!["distance"]));

        await PutJsonAsync(client, url, await GetJsonAsync(client, url));

        Assert.Equal("4.02", await TotalLengthAsync(client, projectId));
    }

    [Fact]
    public async Task Replace_StoresADistanceAsTyped_WhenItsTextChanged_EvenToTheSameValue()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: ["1.004", "1.004", "1.004", "1.004"]);
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var body = await GetJsonAsync(client, url);
        body["shots"]![0]!["distance"] = "1.0";
        body["shots"]![1]!["distance"] = "01";

        await PutJsonAsync(client, url, body);

        // 1 + 1 + 1.004 + 1.004
        Assert.Equal("4.01", await TotalLengthAsync(client, projectId));
    }

    [Fact]
    public async Task Replace_StoresADistanceAsTyped_ForANewShot_EvenWithTheTextShownForAStoredOne()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: ["1.004", "1.004", "1.004", "1.004"]);
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var body = await GetJsonAsync(client, url);
        body["shots"]![0]!["id"] = null;
        body["shots"]![1]!["id"] = null;

        await PutJsonAsync(client, url, body);

        // 1 + 1 + 1.004 + 1.004
        Assert.Equal("4.01", await TotalLengthAsync(client, projectId));
    }

    [Fact]
    public async Task Replace_IsNotFound_ForAnUnknownSegment_OrOneInAnotherProject()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var otherProjectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync($"/api/projects/{projectId}/segments/999999", ValidSegmentBody())).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await client.PutAsJsonAsync($"/api/projects/{otherProjectId}/segments/{segment["id"]}", segment)).StatusCode);
        AssertJson(segment.ToJsonString(), await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}"));
    }

    [Fact]
    public async Task AnotherUser_GetsNotFound_ForEverySegmentOperation()
    {
        using var alice = TestApi.SignInAsNewUser(webFactory, "Alice");
        using var bob = TestApi.SignInAsNewUser(webFactory, "Bob");
        var projectId = await CreateProjectAsync(alice);
        var segment = await CreateSegmentAsync(alice, projectId, "2026-11-21");
        var url = $"/api/projects/{projectId}/segments";
        var changed = segment.DeepClone();
        changed["name"] = "Bob was here";

        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"{url}/new")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PostAsJsonAsync(url, ValidSegmentBody())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"{url}/{segment["id"]}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PutAsJsonAsync($"{url}/{segment["id"]}", changed)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"{url}/{segment["id"]}")).StatusCode);
        Assert.Single((await GetJsonAsync(alice, url)).AsArray());
        AssertJson(segment.ToJsonString(), await GetJsonAsync(alice, $"{url}/{segment["id"]}"));
        Assert.Equal(2, (int)(await GetJsonAsync(alice, $"{url}/new"))["number"]!);
    }

    [Fact]
    public async Task SegmentOperations_GetNotFound_ForAProjectThatDoesNotExist()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        const string url = "/api/projects/999999/segments";

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{url}/new")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(url, ValidSegmentBody())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"{url}/1")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"{url}/1", ValidSegmentBody())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"{url}/1")).StatusCode);
    }

    [Fact]
    public async Task Delete_RemovesTheSegment_SoItIsNoLongerListedOrFound()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";

        var response = await client.DeleteAsync(url);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        AssertJson("[]", await GetJsonAsync(client, $"/api/projects/{projectId}/segments"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(url)).StatusCode);
    }

    // No endpoint reaches a station or shot except through its segment, so whether they went with it is checked in
    // the database.
    [Fact]
    public async Task Delete_RemovesTheSegmentsStationsAndShots()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: ["5", "6"]);
        var segmentId = (int)segment["id"]!;

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await client.DeleteAsync($"/api/projects/{projectId}/segments/{segmentId}")).StatusCode);

        using var scope = webFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<OpenCaveMapDbContext>();
        Assert.False(await dbContext.Set<Station>().AnyAsync(station => station.SegmentId == segmentId));
        Assert.False(await dbContext.Set<Shot>().AnyAsync(shot => shot.SegmentId == segmentId));
    }

    [Fact]
    public async Task Delete_NeverReusesTheNumber_AndTheOtherSegmentsKeepTheirNumbersAndLabels()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var first = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var second = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var third = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var url = $"/api/projects/{projectId}/segments";

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"{url}/{third["id"]}")).StatusCode);
        var next = await GetJsonAsync(client, $"{url}/new");
        var fourth = await CreateSegmentAsync(client, projectId, "2026-11-21");

        Assert.Equal(4, (int)next["number"]!);
        Assert.Equal(4, (int)fourth["number"]!);
        Assert.Equal([4, 2, 1], (await GetJsonAsync(client, url)).AsArray().Select(row => (int)row!["number"]!));
        AssertJson(first.ToJsonString(), await GetJsonAsync(client, $"{url}/{first["id"]}"));
        AssertJson(second.ToJsonString(), await GetJsonAsync(client, $"{url}/{second["id"]}"));
    }

    [Fact]
    public async Task Delete_IsNotFound_ForASegmentInAnotherProject_AndLeavesItThere()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var otherProjectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");

        var response = await client.DeleteAsync($"/api/projects/{otherProjectId}/segments/{segment["id"]}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        AssertJson(segment.ToJsonString(), await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}"));
    }

    [Fact]
    public async Task AProjectWithSegments_CanStillBeDeleted()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        await CreateSegmentAsync(client, projectId, "2026-11-21");
        await CreateSegmentAsync(client, projectId, "2026-11-22");

        var response = await client.DeleteAsync($"/api/projects/{projectId}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{projectId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/projects/{projectId}/segments")).StatusCode);
    }

    // Two stations and one shot, all valid.
    private static JsonObject ValidSegmentBody()
    {
        return new JsonObject
        {
            ["surveyDate"] = "2026-11-21",
            ["name"] = "Main line",
            ["note"] = "Good visibility",
            ["stations"] = new JsonArray(
                new JsonObject { ["id"] = null, ["depth"] = "3", ["note"] = null },
                new JsonObject { ["id"] = null, ["depth"] = "12.5", ["note"] = null }),
            ["shots"] = new JsonArray(
                new JsonObject { ["id"] = null, ["distance"] = "30", ["azimuth"] = "45", ["note"] = null }),
        };
    }

    // Sets a field by its path in the request, such as "stations[1].depth".
    private static void SetField(JsonObject body, string path, string? value)
    {
        var (parent, name) = Resolve(body, path);
        parent[name] = value;
    }

    private static JsonNode? GetField(JsonNode body, string path)
    {
        var (parent, name) = Resolve(body, path);
        return parent[name];
    }

    private static (JsonNode Parent, string Name) Resolve(JsonNode body, string path)
    {
        var parts = path.Split('.');
        var parent = body;
        foreach (var part in parts[..^1])
        {
            var open = part.IndexOf('[', StringComparison.Ordinal);
            parent = parent[part[..open]]![int.Parse(part[(open + 1)..^1], System.Globalization.CultureInfo.InvariantCulture)]!;
        }

        return (parent, parts[^1]);
    }

    private static async Task AssertValidationErrorsAsync(HttpResponseMessage response, Dictionary<string, string[]> expected)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblem>();
        Assert.Equal(
            expected.OrderBy(error => error.Key, StringComparer.Ordinal),
            problem!.Errors.OrderBy(error => error.Key, StringComparer.Ordinal));
    }

    private static async Task<JsonNode> CreateSegmentAsync(
        HttpClient client, int projectId, string surveyDate, string? name = null, string[]? distances = null)
    {
        distances ??= ["5"];
        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", new
        {
            surveyDate,
            name,
            stations = Enumerable.Range(0, distances.Length + 1).Select(_ => new { depth = "10" }),
            shots = distances.Select(distance => new { distance, azimuth = "90" }),
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }

    private static async Task<JsonNode> PutJsonAsync(HttpClient client, string url, JsonNode body)
    {
        var response = await client.PutAsJsonAsync(url, body);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }

    // The total length of the project's only segment, as listed.
    private static async Task<string?> TotalLengthAsync(HttpClient client, int projectId)
    {
        var segments = await GetJsonAsync(client, $"/api/projects/{projectId}/segments");
        return (string?)Assert.Single(segments.AsArray())!["totalLength"];
    }

    private static IEnumerable<string?> Labels(JsonNode? rows)
    {
        return rows!.AsArray().Select(row => (string?)row!["label"]);
    }

    private static IEnumerable<int> Ids(JsonNode? rows)
    {
        return rows!.AsArray().Select(row => (int)row!["id"]!);
    }

    private static async Task<int> CreateProjectAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/projects", new { name = $"Cave {Guid.NewGuid()}" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var project = await response.Content.ReadFromJsonAsync<JsonObject>();
        return (int)project!["id"]!;
    }

    private static async Task<JsonNode> GetJsonAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }

    private sealed record ValidationProblem(string Title, Dictionary<string, string[]> Errors);

    // Compares the whole JSON document, so a missing, extra or renamed field fails the test.
    private static void AssertJson(string expected, JsonNode? actual)
    {
        Assert.True(
            JsonNode.DeepEquals(JsonNode.Parse(expected), actual),
            $"Expected {JsonNode.Parse(expected)!.ToJsonString()}{Environment.NewLine}but got {actual?.ToJsonString()}");
    }
}

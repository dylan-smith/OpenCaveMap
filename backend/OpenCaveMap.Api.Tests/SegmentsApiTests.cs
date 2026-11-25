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
              "id": null, "number": 1, "surveyDate": null, "name": null, "note": null, "unitSystem": "metric",
              "stations": [
                { "id": null, "depth": null, "note": null },
                { "id": null, "depth": null, "note": null }
              ],
              "shots": [
                { "id": null, "distance": null, "azimuth": null, "note": null }
              ]
            }
            """,
            segment);
    }

    [Fact]
    public async Task Create_ReturnsTheSavedSegment_WithIdsAndReadingsAsStored()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", new JsonObject
        {
            ["surveyDate"] = "2026-11-21",
            ["unitSystem"] = "metric",
            ["name"] = "  Main line upstream  ",
            ["note"] = "Good visibility",
            ["stations"] = new JsonArray(
                new JsonObject { ["id"] = null, ["depth"] = 3, ["note"] = "Line arrow" },
                new JsonObject { ["id"] = null, ["depth"] = 12.50m, ["note"] = "   " },
                new JsonObject { ["id"] = null, ["depth"] = 0, ["note"] = null }),
            ["shots"] = new JsonArray(
                new JsonObject { ["id"] = null, ["distance"] = 30.00m, ["azimuth"] = 45, ["note"] = "Restriction" },
                new JsonObject { ["id"] = null, ["distance"] = 8.125, ["azimuth"] = 359.5, ["note"] = null }),
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
              "number": 1, "surveyDate": "2026-11-21", "name": "Main line upstream", "note": "Good visibility", "unitSystem": "metric",
              "stations": [
                { "depth": 3, "note": "Line arrow" },
                { "depth": 12.5, "note": null },
                { "depth": 0, "note": null }
              ],
              "shots": [
                { "distance": 30, "azimuth": 45, "note": "Restriction" },
                { "distance": 8.125, "azimuth": 359.5, "note": null }
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
        var older = await CreateSegmentAsync(client, projectId, "2026-03-02", name: "Downstream", distances: [10.004m, 2.5m]);
        var sameDayFirst = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [30m]);
        var sameDaySecond = await CreateSegmentAsync(client, projectId, "2026-11-21", name: "Side passage", distances: [4m, 5m, 6m]);

        var segments = await GetJsonAsync(client, $"/api/projects/{projectId}/segments");

        AssertJson(
            $$"""
            [
              { "id": {{sameDaySecond["id"]}}, "number": 3, "name": "Side passage", "surveyDate": "2026-11-21", "stationCount": 4, "totalLength": 15, "unitSystem": "metric" },
              { "id": {{sameDayFirst["id"]}}, "number": 2, "name": null, "surveyDate": "2026-11-21", "stationCount": 2, "totalLength": 30, "unitSystem": "metric" },
              { "id": {{older["id"]}}, "number": 1, "name": "Downstream", "surveyDate": "2026-03-02", "stationCount": 3, "totalLength": 12.504, "unitSystem": "metric" }
            ]
            """,
            segments);
    }

    [Theory]
    [InlineData("surveyDate", null, "Survey date is required.")]
    [InlineData("stations[1].depth", null, "Depth is required.")]
    [InlineData("stations[1].depth", -0.5, "Depth must be zero or more.")]
    [InlineData("stations[1].depth", 100000.0, "Depth must be less than 100,000 m.")]
    [InlineData("stations[1].depth", 99999.9999999, "Depth must be less than 100,000 m.")]
    [InlineData("stations[1].depth", 1e28, "Depth must be less than 100,000 m.")]
    [InlineData("shots[0].distance", null, "Distance is required.")]
    [InlineData("shots[0].distance", 0.0, "Distance must be more than zero.")]
    [InlineData("shots[0].distance", -3.0, "Distance must be more than zero.")]
    [InlineData("shots[0].distance", 100000.0, "Distance must be less than 100,000 m.")]
    [InlineData("shots[0].azimuth", null, "Azimuth is required.")]
    [InlineData("shots[0].azimuth", -1.0, "Azimuth must be from 0 to 360.")]
    [InlineData("shots[0].azimuth", 360.5, "Azimuth must be from 0 to 360.")]
    public async Task Create_RejectsAnInvalidField_WithAMessageKeyedByThatField(string path, double? value, string message)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, path, value);

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        await AssertValidationErrorsAsync(response, new() { [path] = [message] });
    }

    // A date is sent as YYYY-MM-DD and a reading as a number. Anything else can't be read, so it never reaches the
    // rules above and has no message of its own.
    [Theory]
    [InlineData("surveyDate", "\"2026-02-30\"")]
    [InlineData("surveyDate", "\"21/11/2026\"")]
    [InlineData("surveyDate", "\"\"")]
    [InlineData("surveyDate", "20261121")]
    [InlineData("stations[1].depth", "\"12.5\"")]
    [InlineData("stations[1].depth", "\"deep\"")]
    [InlineData("stations[1].depth", "\"\"")]
    [InlineData("stations[1].depth", "1e40")]
    [InlineData("shots[0].distance", "true")]
    [InlineData("shots[0].azimuth", "\"045\"")]
    public async Task Create_RejectsAFieldOfTheWrongType_AndSavesNothing(string path, string json)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, path, JsonNode.Parse(json));

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblem>();
        Assert.Contains($"$.{path}", problem!.Errors.Keys);
        AssertJson("[]", await GetJsonAsync(client, $"/api/projects/{projectId}/segments"));
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
        body["stations"] = new JsonArray(new JsonObject { ["depth"] = 3 });
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
            .Select(_ => new JsonObject { ["distance"] = 5, ["azimuth"] = 90 })]);

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        await AssertValidationErrorsAsync(
            response, new() { ["shots"] = ["A segment needs exactly one fewer shot than it has stations."] });
    }

    [Fact]
    public async Task Create_ReadsAMissingStationOrShotAsABlankOne()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        body["stations"]![1] = null;
        body["shots"]![0] = null;

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        await AssertValidationErrorsAsync(response, new()
        {
            ["stations[1].depth"] = ["Depth is required."],
            ["shots[0].distance"] = ["Distance is required."],
            ["shots[0].azimuth"] = ["Azimuth is required."],
        });
    }

    [Fact]
    public async Task Create_ReportsEveryProblemAtOnce_AndSavesNothing()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, "surveyDate", null);
        SetField(body, "stations[0].depth", null);
        SetField(body, "shots[0].azimuth", 400);

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
    [InlineData("stations[0].depth", 0.0, 0.0)]
    [InlineData("stations[0].depth", 0.5, 0.5)]
    [InlineData("stations[0].depth", 1.005, 1.005)]
    [InlineData("stations[0].depth", 1.0000005, 1.000001)]
    [InlineData("stations[0].depth", 99999.99, 99999.99)]
    [InlineData("shots[0].distance", 0.25, 0.25)]
    [InlineData("shots[0].distance", 9.144, 9.144)]
    [InlineData("shots[0].azimuth", 0.0, 0.0)]
    [InlineData("shots[0].azimuth", 12.345, 12.345)]
    [InlineData("shots[0].azimuth", 12.3456, 12.346)]
    [InlineData("shots[0].azimuth", 360.0, 0.0)]
    [InlineData("shots[0].azimuth", 359.9999, 0.0)]
    public async Task Create_AcceptsAReading_AndReturnsItAsStored(string path, double value, double stored)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var body = ValidSegmentBody();
        SetField(body, path, value);

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var segment = await response.Content.ReadFromJsonAsync<JsonNode>();
        Assert.Equal((decimal)stored, (decimal)GetField(segment!, path)!);
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
    public async Task Get_ReturnsTheSegment_WithIdsReadingsAndNotes()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var created = await CreateSegmentAsync(client, projectId, "2026-11-21", name: "Main line", distances: [8.125m, 4m]);

        var segment = await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{created["id"]}");

        AssertJson(
            $$"""
            {
              "id": {{created["id"]}}, "number": 1, "surveyDate": "2026-11-21", "name": "Main line", "note": null, "unitSystem": "metric",
              "stations": [
                { "id": {{created["stations"]![0]!["id"]}}, "depth": 10, "note": null },
                { "id": {{created["stations"]![1]!["id"]}}, "depth": 10, "note": null },
                { "id": {{created["stations"]![2]!["id"]}}, "depth": 10, "note": null }
              ],
              "shots": [
                { "id": {{created["shots"]![0]!["id"]}}, "distance": 8.125, "azimuth": 90, "note": null },
                { "id": {{created["shots"]![1]!["id"]}}, "distance": 4, "azimuth": 90, "note": null }
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
        body["stations"]![1]!["depth"] = 21.5;
        body["stations"]![1]!["note"] = "Jump left";
        body["shots"]![0]!["distance"] = 7;
        body["shots"]![0]!["azimuth"] = 360;
        body["shots"]![0]!["note"] = "Restriction";

        var response = await client.PutAsJsonAsync(url, body);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var expected =
            $$"""
            {
              "id": {{segment["id"]}}, "number": 2, "surveyDate": "2026-03-02", "name": "Upstream", "note": "Silty", "unitSystem": "metric",
              "stations": [
                { "id": {{segment["stations"]![0]!["id"]}}, "depth": 10, "note": null },
                { "id": {{segment["stations"]![1]!["id"]}}, "depth": 21.5, "note": "Jump left" }
              ],
              "shots": [
                { "id": {{segment["shots"]![0]!["id"]}}, "distance": 7, "azimuth": 0, "note": "Restriction" }
              ]
            }
            """;
        AssertJson(expected, await response.Content.ReadFromJsonAsync<JsonNode>());
        AssertJson(expected, await GetJsonAsync(client, url));
        var listed = (await GetJsonAsync(client, $"/api/projects/{projectId}/segments")).AsArray();
        Assert.Equal(["2026-11-20", "2026-03-02"], listed.Select(row => (string?)row!["surveyDate"]));
        Assert.Equal(7m, (decimal)listed[1]!["totalLength"]!);
    }

    [Fact]
    public async Task Replace_AddingAShotAndStationAtTheEnd_GivesThemNewIdentitiesAtTheEnd()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var body = segment.DeepClone();
        body["stations"]!.AsArray().Add(new JsonObject { ["id"] = null, ["depth"] = 4, ["note"] = "Sump" });
        body["shots"]!.AsArray().Add(new JsonObject { ["id"] = null, ["distance"] = 6, ["azimuth"] = 180, ["note"] = null });

        var saved = await PutJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}", body);

        Assert.Equal(Ids(segment["stations"]), Ids(saved["stations"]).Take(2));
        Assert.Equal(Ids(segment["shots"]), Ids(saved["shots"]).Take(1));
        Assert.DoesNotContain((int)saved["stations"]![2]!["id"]!, Ids(segment["stations"]));
        Assert.Equal("Sump", (string?)saved["stations"]![2]!["note"]);
        Assert.Equal(180m, (decimal)saved["shots"]![1]!["azimuth"]!);
    }

    [Fact]
    public async Task Replace_OmittingAStationAndItsShot_KeepsTheRestInOrder_AndNotesStayWithTheirRows()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [1m, 2m, 3m]);
        var body = segment.DeepClone();
        body["stations"]![2]!["note"] = "Line arrow";
        body["shots"]![2]!["note"] = "Restriction";
        // Removes station 1.1 and the shot arriving at it.
        body["stations"]!.AsArray().RemoveAt(1);
        body["shots"]!.AsArray().RemoveAt(0);

        var saved = await PutJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}", body);

        Assert.Equal(
            [(int)segment["stations"]![0]!["id"]!, (int)segment["stations"]![2]!["id"]!, (int)segment["stations"]![3]!["id"]!],
            Ids(saved["stations"]));
        Assert.Equal([(int)segment["shots"]![1]!["id"]!, (int)segment["shots"]![2]!["id"]!], Ids(saved["shots"]));
        Assert.Equal([null, "Line arrow", null], saved["stations"]!.AsArray().Select(row => (string?)row!["note"]));
        Assert.Equal([2m, 3m], Distances(saved));
        Assert.Equal([null, "Restriction"], saved["shots"]!.AsArray().Select(row => (string?)row!["note"]));
        AssertJson(saved.ToJsonString(), await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}"));
    }

    [Fact]
    public async Task Replace_AddingAStationInTheMiddle_PutsItInOrder_AndNotesStayWithTheirRows()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [1m, 2m]);
        var body = segment.DeepClone();
        body["stations"]![1]!["note"] = "Jump left";
        body["shots"]![1]!["note"] = "Restriction";
        // Inserts a station after 1.0, with the shot arriving at it.
        body["stations"]!.AsArray().Insert(1, new JsonObject { ["id"] = null, ["depth"] = 11, ["note"] = "Missed" });
        body["shots"]!.AsArray().Insert(0, new JsonObject { ["id"] = null, ["distance"] = 0.5, ["azimuth"] = 10, ["note"] = null });

        var saved = await PutJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}", body);

        Assert.Equal((int)segment["stations"]![1]!["id"]!, (int)saved["stations"]![2]!["id"]!);
        Assert.Equal((int)segment["shots"]![0]!["id"]!, (int)saved["shots"]![1]!["id"]!);
        Assert.Equal([null, "Missed", "Jump left", null], saved["stations"]!.AsArray().Select(row => (string?)row!["note"]));
        Assert.Equal([0.5m, 1m, 2m], Distances(saved));
        Assert.Equal([null, null, "Restriction"], saved["shots"]!.AsArray().Select(row => (string?)row!["note"]));
        AssertJson(saved.ToJsonString(), await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}"));
    }

    [Theory]
    [InlineData("surveyDate", null, "Survey date is required.")]
    [InlineData("stations[1].depth", null, "Depth is required.")]
    [InlineData("stations[1].depth", -0.5, "Depth must be zero or more.")]
    [InlineData("shots[0].distance", 0.0, "Distance must be more than zero.")]
    [InlineData("shots[0].azimuth", 400.0, "Azimuth must be from 0 to 360.")]
    public async Task Replace_RejectsAnInvalidField_WithAMessageKeyedByThatField_AndChangesNothing(
        string path, double? value, string message)
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

    [Theory]
    [InlineData("surveyDate", "\"2026-02-30\"")]
    [InlineData("stations[1].depth", "\"deep\"")]
    [InlineData("shots[0].azimuth", "\"90\"")]
    public async Task Replace_RejectsAFieldOfTheWrongType_AndChangesNothing(string path, string json)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var body = (JsonObject)segment.DeepClone();
        body["name"] = "Changed";
        SetField(body, path, JsonNode.Parse(json));

        var response = await client.PutAsJsonAsync(url, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
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
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [1m, 2m]);
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

    // Readings come back unrounded, so a segment sent back as it was returned is stored exactly as it was.
    [Fact]
    public async Task Replace_StoresReadingsAsSent_SoUnchangedOnesStayAsStored()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [1.004m, 1.004m]);
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var body = await GetJsonAsync(client, url);
        body["shots"]![1]!["distance"] = 2.0005m;

        var saved = await PutJsonAsync(client, url, body);

        Assert.Equal([1.004m, 2.0005m], Distances(saved));
        Assert.Equal(3.0045m, await TotalLengthAsync(client, projectId));
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
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [5m, 6m]);
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
    public async Task Delete_NeverReusesTheNumber_AndLeavesTheOtherSegmentsAsTheyWere()
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

    [Fact]
    public async Task NewSegment_IsInTheProjectsUnitSystem()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        await SetUnitSystemAsync(client, projectId, "imperial");

        var segment = await GetJsonAsync(client, $"/api/projects/{projectId}/segments/new");

        Assert.Equal("imperial", (string?)segment["unitSystem"]);
    }

    [Fact]
    public async Task ReadingsTypedInFeet_AreReturnedInFeet_AndInMetresAfterSwitchingToMetric_AndInFeetAgainAfterSwitchingBack()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        await SetUnitSystemAsync(client, projectId, "imperial");

        var created = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [30m, 12.5m], unitSystem: "imperial");
        var url = $"/api/projects/{projectId}/segments/{created["id"]}";
        var reopened = await GetJsonAsync(client, url);
        await SetUnitSystemAsync(client, projectId, "metric");
        var inMetres = await GetJsonAsync(client, url);
        var listedInMetres = await GetJsonAsync(client, $"/api/projects/{projectId}/segments");
        await SetUnitSystemAsync(client, projectId, "imperial");
        var inFeetAgain = await GetJsonAsync(client, url);
        var listedInFeet = await GetJsonAsync(client, $"/api/projects/{projectId}/segments");

        foreach (var segment in new[] { created, reopened, inFeetAgain })
        {
            Assert.Equal("imperial", (string?)segment["unitSystem"]);
            Assert.Equal([30m, 12.5m], Distances(segment));
            Assert.Equal([10m, 10m, 10m], Depths(segment));
        }

        Assert.Equal("metric", (string?)inMetres["unitSystem"]);
        // 9.144 and 3.81 metres, and depths of 3.048.
        Assert.Equal([9.144m, 3.81m], Distances(inMetres));
        Assert.Equal([3.048m, 3.048m, 3.048m], Depths(inMetres));
        Assert.Equal([90m, 90m], inMetres["shots"]!.AsArray().Select(row => (decimal)row!["azimuth"]!));
        // 42.5 feet is 12.954 metres.
        Assert.Equal(12.954m, (decimal)listedInMetres[0]!["totalLength"]!);
        Assert.Equal("metric", (string?)listedInMetres[0]!["unitSystem"]);
        Assert.Equal(42.5m, (decimal)listedInFeet[0]!["totalLength"]!);
        Assert.Equal("imperial", (string?)listedInFeet[0]!["unitSystem"]);
    }

    // Nothing is rounded on the way out: 12.3 metres is as many feet as a decimal holds.
    [Theory]
    [InlineData("9.144", "30")]
    [InlineData("0.04572", "0.15")]
    [InlineData("12.3", "40.354330708661417322834645669")]
    public async Task ADistanceTypedInMetres_IsReturnedInFeet_Unrounded(string typed, string feet)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var created = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [Number(typed)]);
        await SetUnitSystemAsync(client, projectId, "imperial");

        var segment = await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{created["id"]}");

        Assert.Equal([Number(feet)], Distances(segment));
    }

    // Six decimal places in metres are enough for any reading typed in feet with up to two decimals to come back as it
    // was typed.
    [Theory]
    [InlineData("30.25")]
    [InlineData("12.34")]
    [InlineData("0.01")]
    [InlineData("328083.98")]
    public async Task ADistanceTypedInFeet_IsReturnedInFeet_AsTyped(string typed)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        await SetUnitSystemAsync(client, projectId, "imperial");

        var segment = await CreateSegmentAsync(
            client, projectId, "2026-11-21", distances: [Number(typed)], unitSystem: "imperial");

        Assert.Equal([Number(typed)], Distances(segment));
        Assert.Equal([Number(typed)], Distances(await GetJsonAsync(client, $"/api/projects/{projectId}/segments/{segment["id"]}")));
    }

    [Fact]
    public async Task Create_ConvertsWithTheRequestsUnitSystem_AndAnswersInTheProjects()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);

        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [30m], unitSystem: "imperial");

        Assert.Equal("metric", (string?)segment["unitSystem"]);
        Assert.Equal([9.144m], Distances(segment));
    }

    [Fact]
    public async Task Replace_ConvertsWithTheRequestsUnitSystem_WhenTheProjectsChangedWhileTheSegmentWasOpen()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [9.144m, 4m]);
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var body = await GetJsonAsync(client, url);
        // Switched in another tab while the segment was open in metres.
        await SetUnitSystemAsync(client, projectId, "imperial");
        body["shots"]![1]!["distance"] = 3.048;

        var saved = await PutJsonAsync(client, url, body);

        Assert.Equal("imperial", (string?)saved["unitSystem"]);
        Assert.Equal([30m, 10m], Distances(saved));
        await SetUnitSystemAsync(client, projectId, "metric");
        Assert.Equal([9.144m, 3.048m], Distances(await GetJsonAsync(client, url)));
    }

    // The entry screen doesn't name a unit system yet, and what it sends is in metres.
    [Fact]
    public async Task CreateAndReplace_ReadARequestThatNamesNoUnitSystemAsMetres()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        await SetUnitSystemAsync(client, projectId, "imperial");
        var body = ValidSegmentBody();
        body.Remove("unitSystem");
        body["shots"]![0]!["distance"] = 9.144;

        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<JsonNode>())!;
        body["shots"]![0]!["distance"] = 3.048;
        var replaced = await PutJsonAsync(client, $"/api/projects/{projectId}/segments/{created["id"]}", body);

        // 9.144 metres is 30 feet, and 3.048 metres is 10.
        Assert.Equal([30m], Distances(created));
        Assert.Equal([10m], Distances(replaced));
    }

    // A unit system is sent by its name, exactly as responses write it.
    [Theory]
    [InlineData("\"feet\"")]
    [InlineData("\"Metric\"")]
    [InlineData("\"\"")]
    [InlineData("1")]
    public async Task CreateAndReplace_RejectAnUnknownUnitSystem(string json)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21");
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        var createBody = ValidSegmentBody();
        createBody["unitSystem"] = JsonNode.Parse(json);
        var replaceBody = segment.DeepClone();
        replaceBody["name"] = "Changed";
        replaceBody["unitSystem"] = JsonNode.Parse(json);

        var created = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", createBody);
        var replaced = await client.PutAsJsonAsync(url, replaceBody);

        Assert.Equal(HttpStatusCode.BadRequest, created.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, replaced.StatusCode);
        Assert.Single((await GetJsonAsync(client, $"/api/projects/{projectId}/segments")).AsArray());
        AssertJson(segment.ToJsonString(), await GetJsonAsync(client, url));
    }

    // 328,084 feet is 100,000.0032 metres, and 328,083 feet is 99,999.6984.
    [Theory]
    [InlineData("stations[1].depth", "Depth")]
    [InlineData("shots[0].distance", "Distance")]
    public async Task TheUpperLimit_AppliesToTheValueInMetres(string path, string reading)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var tooLong = ValidSegmentBody();
        tooLong["unitSystem"] = "imperial";
        SetField(tooLong, path, 328084);
        var longest = ValidSegmentBody();
        longest["unitSystem"] = "imperial";
        SetField(longest, path, 328083);

        var rejected = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", tooLong);
        var accepted = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", longest);

        await AssertValidationErrorsAsync(rejected, new() { [path] = [$"{reading} must be less than 100,000 m."] });
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        Assert.Equal(99999.6984m, (decimal)GetField((await accepted.Content.ReadFromJsonAsync<JsonNode>())!, path)!);
    }

    // What comes back in the other unit system is unrounded, so sending it back changes nothing that's stored.
    [Fact]
    public async Task Replace_WithDistancesAsReturnedInFeet_StoresThemAsTheyWere()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [12.3m, 9.144m]);
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        await SetUnitSystemAsync(client, projectId, "imperial");

        await PutJsonAsync(client, url, await GetJsonAsync(client, url));
        await SetUnitSystemAsync(client, projectId, "metric");

        Assert.Equal([12.3m, 9.144m], Distances(await GetJsonAsync(client, url)));
        Assert.Equal(21.444m, await TotalLengthAsync(client, projectId));
    }

    [Fact]
    public async Task Replace_WithDistancesTypedInFeet_AsReturnedInMetres_StoresThemAsTheyWere()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        await SetUnitSystemAsync(client, projectId, "imperial");
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [30m, 40.4m], unitSystem: "imperial");
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        await SetUnitSystemAsync(client, projectId, "metric");
        var inMetres = await GetJsonAsync(client, url);
        Assert.Equal([9.144m, 12.31392m], Distances(inMetres));

        await PutJsonAsync(client, url, inMetres);
        await SetUnitSystemAsync(client, projectId, "imperial");

        Assert.Equal([30m, 40.4m], Distances(await GetJsonAsync(client, url)));
        Assert.Equal(70.4m, await TotalLengthAsync(client, projectId));
    }

    [Fact]
    public async Task Replace_ConvertsAChangedReadingAndANewShot_FromWhatWasTyped()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var projectId = await CreateProjectAsync(client);
        var segment = await CreateSegmentAsync(client, projectId, "2026-11-21", distances: [12.3m, 12.3m]);
        var url = $"/api/projects/{projectId}/segments/{segment["id"]}";
        await SetUnitSystemAsync(client, projectId, "imperial");
        var body = await GetJsonAsync(client, url);
        body["shots"]![1]!["distance"] = 40;
        body["stations"]!.AsArray().Add(new JsonObject { ["id"] = null, ["depth"] = 20, ["note"] = null });
        body["shots"]!.AsArray().Add(new JsonObject { ["id"] = null, ["distance"] = 40.4, ["azimuth"] = 90, ["note"] = null });

        await PutJsonAsync(client, url, body);
        await SetUnitSystemAsync(client, projectId, "metric");

        // The first went back as it was returned, the changed one is 12.192 m, and the new one 12.31392 m.
        var saved = await GetJsonAsync(client, url);
        Assert.Equal([12.3m, 12.192m, 12.31392m], Distances(saved));
        Assert.Equal(6.096m, (decimal)saved["stations"]![3]!["depth"]!);
        Assert.Equal(36.80592m, await TotalLengthAsync(client, projectId));
    }

    // Two stations and one shot, all valid.
    private static JsonObject ValidSegmentBody()
    {
        return new JsonObject
        {
            ["surveyDate"] = "2026-11-21",
            ["unitSystem"] = "metric",
            ["name"] = "Main line",
            ["note"] = "Good visibility",
            ["stations"] = new JsonArray(
                new JsonObject { ["id"] = null, ["depth"] = 3, ["note"] = null },
                new JsonObject { ["id"] = null, ["depth"] = 12.5, ["note"] = null }),
            ["shots"] = new JsonArray(
                new JsonObject { ["id"] = null, ["distance"] = 30, ["azimuth"] = 45, ["note"] = null }),
        };
    }

    // Sets a field by its path in the request, such as "stations[1].depth".
    private static void SetField(JsonObject body, string path, JsonNode? value)
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
        HttpClient client,
        int projectId,
        string surveyDate,
        string? name = null,
        decimal[]? distances = null,
        string unitSystem = "metric")
    {
        distances ??= [5];
        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", new
        {
            surveyDate,
            unitSystem,
            name,
            stations = Enumerable.Range(0, distances.Length + 1).Select(_ => new { depth = 10 }),
            shots = distances.Select(distance => new { distance, azimuth = 90 }),
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
    private static async Task<decimal> TotalLengthAsync(HttpClient client, int projectId)
    {
        var segments = await GetJsonAsync(client, $"/api/projects/{projectId}/segments");
        return (decimal)Assert.Single(segments.AsArray())!["totalLength"]!;
    }

    private static IEnumerable<decimal> Distances(JsonNode segment)
    {
        return segment["shots"]!.AsArray().Select(row => (decimal)row!["distance"]!);
    }

    // A decimal can't be written in a test's attribute.
    private static decimal Number(string text)
    {
        return decimal.Parse(text, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static IEnumerable<decimal> Depths(JsonNode segment)
    {
        return segment["stations"]!.AsArray().Select(row => (decimal)row!["depth"]!);
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

    private static async Task SetUnitSystemAsync(HttpClient client, int projectId, string unitSystem)
    {
        var project = await GetJsonAsync(client, $"/api/projects/{projectId}");
        var response = await client.PutAsJsonAsync($"/api/projects/{projectId}", new { name = (string?)project["name"], unitSystem });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
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

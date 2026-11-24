using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

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
              "number": 1, "surveyDate": "2026-11-21", "name": "Main line upstream", "note": "Good visibility",
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
              { "id": {{sameDaySecond["id"]}}, "number": 3, "name": "Side passage", "surveyDate": "2026-11-21", "stationCount": 4, "totalLength": 15 },
              { "id": {{sameDayFirst["id"]}}, "number": 2, "name": null, "surveyDate": "2026-11-21", "stationCount": 2, "totalLength": 30 },
              { "id": {{older["id"]}}, "number": 1, "name": "Downstream", "surveyDate": "2026-03-02", "stationCount": 3, "totalLength": 12.504 }
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
    public async Task AnotherUser_GetsNotFound_ForEverySegmentOperation()
    {
        using var alice = TestApi.SignInAsNewUser(webFactory, "Alice");
        using var bob = TestApi.SignInAsNewUser(webFactory, "Bob");
        var projectId = await CreateProjectAsync(alice);
        await CreateSegmentAsync(alice, projectId, "2026-11-21");
        var url = $"/api/projects/{projectId}/segments";

        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync(url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"{url}/new")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.PostAsJsonAsync(url, ValidSegmentBody())).StatusCode);
        Assert.Single((await GetJsonAsync(alice, url)).AsArray());
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
        HttpClient client, int projectId, string surveyDate, string? name = null, decimal[]? distances = null)
    {
        distances ??= [5];
        var response = await client.PostAsJsonAsync($"/api/projects/{projectId}/segments", new
        {
            surveyDate,
            name,
            stations = Enumerable.Range(0, distances.Length + 1).Select(_ => new { depth = 10 }),
            shots = distances.Select(distance => new { distance, azimuth = 90 }),
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
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

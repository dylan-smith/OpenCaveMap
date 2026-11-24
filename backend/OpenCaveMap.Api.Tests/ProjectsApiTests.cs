using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OpenCaveMap.Api.Tests;

// The project's unit system, over HTTP. ProjectsControllerTests covers the rest of the projects controller.
public class ProjectsApiTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> webFactory = TestApi.Configure(factory);

    [Fact]
    public async Task ANewProject_IsMetric()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);

        var response = await client.PostAsJsonAsync("/api/projects", new { name = "Cave" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = (await response.Content.ReadFromJsonAsync<JsonNode>())!;
        Assert.Equal("metric", (string?)created["unitSystem"]);
        Assert.Equal("metric", (string?)(await GetJsonAsync(client, $"/api/projects/{created["id"]}"))["unitSystem"]);
        Assert.Equal("metric", (string?)(await GetJsonAsync(client, "/api/projects"))[0]!["unitSystem"]);
    }

    [Fact]
    public async Task Create_SetsTheUnitSystem_WhenOneIsGiven()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);

        var response = await client.PostAsJsonAsync("/api/projects", new { name = "Cave", unitSystem = "imperial" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("imperial", (string?)(await response.Content.ReadFromJsonAsync<JsonNode>())!["unitSystem"]);
    }

    [Fact]
    public async Task Update_ChangesTheUnitSystem_WhenOneIsGiven()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var id = await CreateProjectAsync(client);

        var toImperial = await client.PutAsJsonAsync($"/api/projects/{id}", new { name = "Cave", unitSystem = "imperial" });
        var afterImperial = await GetJsonAsync(client, $"/api/projects/{id}");
        var toMetric = await client.PutAsJsonAsync($"/api/projects/{id}", new { name = "Cave", unitSystem = "metric" });
        var afterMetric = await GetJsonAsync(client, $"/api/projects/{id}");

        Assert.Equal(HttpStatusCode.OK, toImperial.StatusCode);
        Assert.Equal("imperial", (string?)(await toImperial.Content.ReadFromJsonAsync<JsonNode>())!["unitSystem"]);
        Assert.Equal("imperial", (string?)afterImperial["unitSystem"]);
        Assert.Equal(HttpStatusCode.OK, toMetric.StatusCode);
        Assert.Equal("metric", (string?)afterMetric["unitSystem"]);
    }

    [Fact]
    public async Task Update_LeavesTheUnitSystemAsItWas_WhenNoneIsGiven()
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var id = await CreateProjectAsync(client);
        await client.PutAsJsonAsync($"/api/projects/{id}", new { name = "Cave", unitSystem = "imperial" });

        var response = await client.PutAsJsonAsync($"/api/projects/{id}", new { name = "Renamed cave" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var project = await GetJsonAsync(client, $"/api/projects/{id}");
        Assert.Equal("Renamed cave", (string?)project["name"]);
        Assert.Equal("imperial", (string?)project["unitSystem"]);
    }

    [Theory]
    [InlineData("feet")]
    [InlineData("Imperial")]
    [InlineData("")]
    public async Task CreateAndUpdate_RejectAnUnknownUnitSystem(string unitSystem)
    {
        using var client = TestApi.SignInAsNewUser(webFactory);
        var id = await CreateProjectAsync(client);

        var created = await client.PostAsJsonAsync("/api/projects", new { name = "Other cave", unitSystem });
        var updated = await client.PutAsJsonAsync($"/api/projects/{id}", new { name = "Renamed cave", unitSystem });

        await AssertUnitSystemRejectedAsync(created);
        await AssertUnitSystemRejectedAsync(updated);
        var projects = await GetJsonAsync(client, "/api/projects");
        var project = Assert.Single(projects.AsArray())!;
        Assert.Equal("Cave", (string?)project["name"]);
        Assert.Equal("metric", (string?)project["unitSystem"]);
    }

    private static async Task AssertUnitSystemRejectedAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonNode>();
        Assert.Equal(
            ["Unit system must be metric or imperial."],
            problem!["errors"]!["unitSystem"]!.AsArray().Select(message => (string?)message));
    }

    private static async Task<int> CreateProjectAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/projects", new { name = "Cave" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (int)(await response.Content.ReadFromJsonAsync<JsonNode>())!["id"]!;
    }

    private static async Task<JsonNode> GetJsonAsync(HttpClient client, string url)
    {
        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonNode>())!;
    }
}

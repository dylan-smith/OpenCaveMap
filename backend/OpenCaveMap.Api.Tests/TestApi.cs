using System.Net.Http.Headers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace OpenCaveMap.Api.Tests;

// Runs the real API in-process for tests that go over HTTP.
internal static class TestApi
{
    public static WebApplicationFactory<Program> Configure(
        WebApplicationFactory<Program> factory, bool allowTestSignIn = true, string serviceToken = "")
    {
        // Development uses the in-memory database, so the app starts without SQL Server.
        return factory.WithWebHostBuilder(builder => builder
            .UseEnvironment("Development")
            .UseSetting("Authentication:AllowTestSignIn", allowTestSignIn.ToString())
            .UseSetting("Authentication:ServiceToken", serviceToken));
    }

    public static HttpClient CreateClient(WebApplicationFactory<Program> webFactory, string? token)
    {
        var client = webFactory.CreateClient();

        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return client;
    }

    // Signs in as a new test user. The in-memory database is shared by every test using the factory, so each test
    // gets a user, and so projects, of its own.
    public static HttpClient SignInAsNewUser(WebApplicationFactory<Program> webFactory, string name = "Tester")
    {
        return CreateClient(webFactory, $"test:{name} {Guid.NewGuid()}");
    }
}

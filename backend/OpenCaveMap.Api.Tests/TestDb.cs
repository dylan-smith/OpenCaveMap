using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using OpenCaveMap.Api.Authentication;
using OpenCaveMap.Api.Data;

namespace OpenCaveMap.Api.Tests;

internal static class TestDb
{
    // The user the controller tests act as, unless a test signs in as someone else.
    public const int UserId = 1;

    public const int OtherUserId = 2;

    public static OpenCaveMapDbContext Create(string? databaseName = null, int userId = UserId, params IInterceptor[] interceptors)
    {
        var options = new DbContextOptionsBuilder<OpenCaveMapDbContext>()
            .UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString())
            .AddInterceptors(interceptors)
            .Options;

        return new OpenCaveMapDbContext(options, new CurrentUser { UserId = userId });
    }
}

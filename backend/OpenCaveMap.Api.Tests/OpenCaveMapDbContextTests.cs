using Microsoft.EntityFrameworkCore;
using OpenCaveMap.Api.Data;
using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Tests;

public class OpenCaveMapDbContextTests
{
    // Every segment action looks its project up first, which already hides another user's segments. This is the
    // guard behind that one, so it's tested without a controller.
    [Fact]
    public async Task Segments_AreOnlyThoseInTheCurrentUsersProjects()
    {
        var databaseName = Guid.NewGuid().ToString();
        await using (var otherContext = TestDb.Create(databaseName, TestDb.OtherUserId))
        {
            var theirs = await AddProjectWithASegmentAsync(otherContext, "Theirs");

            Assert.Equal(theirs, Assert.Single(await otherContext.Segments.ToListAsync()).ProjectId);
        }

        await using var dbContext = TestDb.Create(databaseName);
        var mine = await AddProjectWithASegmentAsync(dbContext, "Mine");

        Assert.Equal(mine, Assert.Single(await dbContext.Segments.ToListAsync()).ProjectId);
    }

    // Returns the project's id.
    private static async Task<int> AddProjectWithASegmentAsync(OpenCaveMapDbContext dbContext, string name)
    {
        var project = new Project { Name = name, LastSegmentNumber = 1 };
        dbContext.Projects.Add(project);
        await dbContext.SaveChangesAsync();

        dbContext.Segments.Add(new Segment
        {
            ProjectId = project.Id,
            Number = 1,
            SurveyDate = new DateOnly(2026, 11, 21),
            Stations = [new Station { Position = 0, Depth = 3 }, new Station { Position = 1, Depth = 7 }],
            Shots = [new Shot { Position = 1, Distance = 12.5m, Azimuth = 45 }],
        });
        await dbContext.SaveChangesAsync();

        return project.Id;
    }
}

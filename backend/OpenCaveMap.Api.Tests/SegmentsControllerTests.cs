using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using OpenCaveMap.Api.Contracts;
using OpenCaveMap.Api.Controllers;
using OpenCaveMap.Api.Data;
using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Tests;

// The API only shows depths rounded, and unlike distances they add up to nothing it shows, so whether a replace kept a
// stored depth is checked here, in the database. SegmentsApiTests covers the same rule for distances over HTTP.
public class SegmentsControllerTests
{
    [Theory]
    [InlineData("12.35")]
    [InlineData(" 12.35 ")]
    public async Task Replace_KeepsAStoredDepth_WhenItIsSentBackAsShown(string typed)
    {
        await using var dbContext = TestDb.Create();
        var (controller, projectId, segment) = await CreateSegmentAsync(dbContext, depth: "12.345");
        Assert.Equal("12.35", segment.Stations[1].Depth);

        var result = await controller.Replace(projectId, segment.Id!.Value, Resend(segment, depth: typed));

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(12.345m, await StoredDepthAsync(dbContext, segment.Stations[1].Id!.Value));
    }

    [Theory]
    [InlineData("12.350")]
    [InlineData("12.34")]
    public async Task Replace_StoresADepthAsTyped_WhenItsTextChanged(string typed)
    {
        await using var dbContext = TestDb.Create();
        var (controller, projectId, segment) = await CreateSegmentAsync(dbContext, depth: "12.345");

        var result = await controller.Replace(projectId, segment.Id!.Value, Resend(segment, depth: typed));

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(decimal.Parse(typed, System.Globalization.CultureInfo.InvariantCulture), await StoredDepthAsync(dbContext, segment.Stations[1].Id!.Value));
    }

    [Fact]
    public async Task Replace_StoresADepthAsTyped_ForANewStation_EvenWithTheTextShownForAStoredOne()
    {
        await using var dbContext = TestDb.Create();
        var (controller, projectId, segment) = await CreateSegmentAsync(dbContext, depth: "12.345");
        var request = Resend(segment, depth: "12.35");
        request.Stations![1]!.Id = null;

        await controller.Replace(projectId, segment.Id!.Value, request);

        dbContext.ChangeTracker.Clear();
        var stored = await dbContext.Segments.Include(item => item.Stations).SingleAsync();
        Assert.Equal([3m, 12.35m], stored.Stations.OrderBy(station => station.Position).Select(station => station.Depth));
    }

    // Six decimal places are enough for any reading typed in feet with up to two decimals to be stored exactly.
    [Theory]
    [InlineData("30", "9.144")]
    [InlineData("12.34", "3.761232")]
    [InlineData("0.01", "0.003048")]
    [InlineData("328083.98", "99999.997104")]
    public async Task Create_StoresADepthTypedInFeet_ExactlyInMetres(string typed, string metres)
    {
        await using var dbContext = TestDb.Create();

        var (_, _, segment) = await CreateSegmentAsync(dbContext, depth: typed, unitSystem: UnitSystem.Imperial);

        Assert.Equal(decimal.Parse(metres, System.Globalization.CultureInfo.InvariantCulture), await StoredDepthAsync(dbContext, segment.Stations[1].Id!.Value));
    }

    [Fact]
    public async Task Replace_KeepsAStoredDepth_WhenItIsSentBackAsShownInTheOtherUnitSystem()
    {
        await using var dbContext = TestDb.Create();
        var (controller, projectId, segment) = await CreateSegmentAsync(dbContext, depth: "12.3");
        (await dbContext.Projects.SingleAsync()).UnitSystem = UnitSystem.Imperial;
        await dbContext.SaveChangesAsync();
        var shown = await controller.GetById(projectId, segment.Id!.Value);
        var inFeet = Assert.IsType<SegmentResponse>(Assert.IsType<OkObjectResult>(shown.Result).Value);
        Assert.Equal("40.4", inFeet.Stations[1].Depth);

        var result = await controller.Replace(projectId, segment.Id!.Value, Resend(inFeet, depth: "40.4"));

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(12.3m, await StoredDepthAsync(dbContext, segment.Stations[1].Id!.Value));
    }

    private static async Task<(SegmentsController Controller, int ProjectId, SegmentResponse Segment)> CreateSegmentAsync(
        OpenCaveMapDbContext dbContext, string depth, UnitSystem unitSystem = UnitSystem.Metric)
    {
        var project = new Project { Name = "Cave", UnitSystem = unitSystem };
        dbContext.Projects.Add(project);
        await dbContext.SaveChangesAsync();

        var controller = new SegmentsController(dbContext, NullLogger<SegmentsController>.Instance);
        var result = await controller.Create(project.Id, new SegmentRequest
        {
            SurveyDate = "2026-11-21",
            UnitSystem = Text(unitSystem),
            Stations = [new StationRequest { Depth = "3" }, new StationRequest { Depth = depth }],
            Shots = [new ShotRequest { Distance = "30", Azimuth = "45" }],
        });

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        return (controller, project.Id, Assert.IsType<SegmentResponse>(created.Value));
    }

    // The segment as the screen would send it back, with the second station's depth typed.
    private static SegmentRequest Resend(SegmentResponse segment, string depth)
    {
        return new SegmentRequest
        {
            SurveyDate = segment.SurveyDate?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
            UnitSystem = Text(segment.UnitSystem),
            Stations = [.. segment.Stations.Select((station, index) => new StationRequest
            {
                Id = station.Id,
                Depth = index == 1 ? depth : station.Depth,
                Note = station.Note,
            })],
            Shots = [.. segment.Shots.Select(shot => new ShotRequest
            {
                Id = shot.Id,
                Distance = shot.Distance,
                Azimuth = shot.Azimuth,
                Note = shot.Note,
            })],
        };
    }

    // As it travels in JSON.
    private static string Text(UnitSystem unitSystem)
    {
        return unitSystem == UnitSystem.Imperial ? "imperial" : "metric";
    }

    private static async Task<decimal> StoredDepthAsync(OpenCaveMapDbContext dbContext, int stationId)
    {
        dbContext.ChangeTracker.Clear();
        var segment = await dbContext.Segments.Include(item => item.Stations).SingleAsync();
        return segment.Stations.Single(station => station.Id == stationId).Depth;
    }
}

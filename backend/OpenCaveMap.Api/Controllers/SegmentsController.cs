using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenCaveMap.Api.Contracts;
using OpenCaveMap.Api.Data;
using OpenCaveMap.Api.Models;
using OpenCaveMap.Api.Segments;

namespace OpenCaveMap.Api.Controllers;

/// <remarks>
/// Segments are only reached through their project. Every action looks the project up first through the query that
/// is filtered to the current user, and answers 404 when it isn't theirs.
/// Log statements use typed identifiers only, never user-typed text, to prevent log-forging.
/// </remarks>
[ApiController]
[Route("api/projects/{projectId:int}/segments")]
public class SegmentsController(OpenCaveMapDbContext dbContext, ILogger<SegmentsController> logger) : ControllerBase
{
    /// <summary>
    /// The project's segments, newest survey date first, then highest number first.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<SegmentSummary>>> GetAll(int projectId)
    {
        if (!await dbContext.Projects.AnyAsync(item => item.Id == projectId))
        {
            logger.LogWarning("Project {ProjectId} not found for listing segments", projectId);
            return NotFound();
        }

        var segments = await dbContext.Segments
            .AsNoTracking()
            .Where(segment => segment.ProjectId == projectId)
            .OrderByDescending(segment => segment.SurveyDate)
            .ThenByDescending(segment => segment.Number)
            .Select(segment => new
            {
                segment.Id,
                segment.Number,
                segment.Name,
                segment.SurveyDate,
                StationCount = segment.Stations.Count,
                // SQL sums no rows to null.
                TotalLength = segment.Shots.Sum(shot => (decimal?)shot.Distance) ?? 0,
            })
            .ToListAsync();

        logger.LogInformation("Retrieved {Count} segments in project {ProjectId}", segments.Count, projectId);

        return Ok(segments.Select(segment => new SegmentSummary(
            segment.Id,
            segment.Number,
            segment.Name,
            segment.SurveyDate,
            segment.StationCount,
            Readings.FormatLength(segment.TotalLength))));
    }

    /// <summary>
    /// The segment the entry screen starts from: the number it will get, the survey date of the project's most
    /// recently added segment, two blank stations and one blank shot.
    /// </summary>
    [HttpGet("new")]
    public async Task<ActionResult<SegmentResponse>> GetNew(int projectId)
    {
        var project = await dbContext.Projects
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == projectId);

        if (project is null)
        {
            logger.LogWarning("Project {ProjectId} not found for a new segment", projectId);
            return NotFound();
        }

        var lastSurveyDate = await dbContext.Segments
            .Where(segment => segment.ProjectId == projectId)
            .OrderByDescending(segment => segment.Number)
            .Select(segment => (DateOnly?)segment.SurveyDate)
            .FirstOrDefaultAsync();

        var number = project.LastSegmentNumber + 1;

        return Ok(new SegmentResponse(
            Id: null,
            number,
            lastSurveyDate,
            Name: null,
            Note: null,
            [BlankStation(number, 0), BlankStation(number, 1)],
            [new ShotResponse(Id: null, Readings.Label(number, 1), Distance: "", Azimuth: "", Note: null)]));

        static StationResponse BlankStation(int number, int position)
        {
            return new StationResponse(Id: null, Readings.Label(number, position), Depth: "", Note: null);
        }
    }

    [HttpPost]
    public async Task<ActionResult<SegmentResponse>> Create(int projectId, [FromBody] SegmentRequest request)
    {
        var project = await dbContext.Projects.FirstOrDefaultAsync(item => item.Id == projectId);

        if (project is null)
        {
            logger.LogWarning("Project {ProjectId} not found for segment creation", projectId);
            return NotFound();
        }

        var input = SegmentInput.Read(request, ModelState);

        if (input is null)
        {
            logger.LogWarning("Segment creation in project {ProjectId} failed validation", projectId);
            return ValidationProblem(ModelState);
        }

        // The number is issued and the segment inserted in one save, so either both happen or neither does.
        project.LastSegmentNumber++;

        // Ids in the request are ignored: every station and shot of a new segment is new.
        var segment = new Segment
        {
            ProjectId = projectId,
            Number = project.LastSegmentNumber,
            SurveyDate = input.SurveyDate,
            Name = input.Name,
            Note = input.Note,
            Stations = [.. input.Stations.Select((station, index) => new Station
            {
                Position = index,
                Depth = station.Depth.Metres,
                Note = station.Note,
            })],
            Shots = [.. input.Shots.Select((shot, index) => new Shot
            {
                Position = index + 1,
                Distance = shot.Distance.Metres,
                Azimuth = shot.Azimuth,
                Note = shot.Note,
            })],
        };

        dbContext.Segments.Add(segment);
        await dbContext.SaveChangesAsync();

        logger.LogInformation(
            "Created segment {SegmentId} with number {SegmentNumber} in project {ProjectId}",
            segment.Id, segment.Number, projectId);

        return CreatedAtAction(nameof(GetById), new { projectId, segmentId = segment.Id }, ToResponse(segment));
    }

    [HttpGet("{segmentId:int}")]
    public async Task<ActionResult<SegmentResponse>> GetById(int projectId, int segmentId)
    {
        var segment = await FindSegmentAsync(projectId, segmentId, tracking: false);

        if (segment is null)
        {
            logger.LogWarning("Segment {SegmentId} not found in project {ProjectId}", segmentId, projectId);
            return NotFound();
        }

        return Ok(ToResponse(segment));
    }

    /// <summary>
    /// Replaces the whole segment. Stations and shots sent with an identity keep it, ones without are new, and saved
    /// ones left out are removed.
    /// </summary>
    [HttpPut("{segmentId:int}")]
    public async Task<ActionResult<SegmentResponse>> Replace(int projectId, int segmentId, [FromBody] SegmentRequest request)
    {
        var segment = await FindSegmentAsync(projectId, segmentId, tracking: true);

        if (segment is null)
        {
            logger.LogWarning("Segment {SegmentId} not found in project {ProjectId} for replacement", segmentId, projectId);
            return NotFound();
        }

        var input = SegmentInput.Read(request, ModelState, replacing: segment);

        if (input is null)
        {
            logger.LogWarning("Replacement of segment {SegmentId} in project {ProjectId} failed validation", segmentId, projectId);
            return ValidationProblem(ModelState);
        }

        // One save, so the replacement either wholly happens or changes nothing.
        SegmentReplacement.Apply(segment, input);
        await dbContext.SaveChangesAsync();

        logger.LogInformation("Replaced segment {SegmentId} in project {ProjectId}", segmentId, projectId);

        return Ok(ToResponse(segment));
    }

    /// <summary>
    /// Deletes the segment with its stations and shots. Its number isn't reused, since the project's counter only
    /// goes up.
    /// </summary>
    [HttpDelete("{segmentId:int}")]
    public async Task<IActionResult> Delete(int projectId, int segmentId)
    {
        // Loaded with its stations and shots, so they're removed with it even where the database doesn't cascade.
        var segment = await FindSegmentAsync(projectId, segmentId, tracking: true);

        if (segment is null)
        {
            logger.LogWarning("Segment {SegmentId} not found in project {ProjectId} for deletion", segmentId, projectId);
            return NotFound();
        }

        dbContext.Segments.Remove(segment);
        await dbContext.SaveChangesAsync();

        logger.LogInformation("Deleted segment {SegmentId} in project {ProjectId}", segmentId, projectId);

        return NoContent();
    }

    // The segment with its stations and shots, or null unless both the project is the current user's and the segment
    // belongs to it.
    private async Task<Segment?> FindSegmentAsync(int projectId, int segmentId, bool tracking)
    {
        if (!await dbContext.Projects.AnyAsync(item => item.Id == projectId))
        {
            return null;
        }

        var segments = tracking ? dbContext.Segments : dbContext.Segments.AsNoTracking();

        return await segments
            .Include(segment => segment.Stations)
            .Include(segment => segment.Shots)
            .AsSplitQuery()
            .FirstOrDefaultAsync(segment => segment.Id == segmentId && segment.ProjectId == projectId);
    }

    private static SegmentResponse ToResponse(Segment segment)
    {
        return new SegmentResponse(
            segment.Id,
            segment.Number,
            segment.SurveyDate,
            segment.Name,
            segment.Note,
            [.. segment.Stations
                .OrderBy(station => station.Position)
                .Select(station => new StationResponse(
                    station.Id,
                    Readings.Label(segment.Number, station.Position),
                    Readings.FormatLength(station.Depth),
                    station.Note))],
            [.. segment.Shots
                .OrderBy(shot => shot.Position)
                .Select(shot => new ShotResponse(
                    shot.Id,
                    Readings.Label(segment.Number, shot.Position),
                    Readings.FormatLength(shot.Distance),
                    Readings.FormatAzimuth(shot.Azimuth),
                    shot.Note))]);
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenCaveMap.Api.Contracts;
using OpenCaveMap.Api.Data;
using OpenCaveMap.Api.Models;
using OpenCaveMap.Api.Segments;

namespace OpenCaveMap.Api.Controllers;

/// <remarks>
/// Segments are only reached through their project. Every action looks the project up first, and answers 404 when it
/// isn't the current user's: <see cref="OpenCaveMapDbContext"/> filters every query for projects to the current user,
/// and every query for segments to that user's projects.
/// Log statements use typed identifiers only, never user-typed text, to prevent log-forging.
/// </remarks>
[ApiController]
[Route("api/projects/{projectId:int}/segments")]
public class SegmentsController(OpenCaveMapDbContext dbContext, ILogger<SegmentsController> logger) : ControllerBase
{
    /// <summary>
    /// The project's segments, newest survey date first, then highest number first, with total lengths in the
    /// project's unit system.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<SegmentSummary>>> GetAll(int projectId)
    {
        if (await FindUnitSystemAsync(projectId) is not UnitSystem unitSystem)
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
            LengthUnits.FromMetres(segment.TotalLength, unitSystem),
            unitSystem)));
    }

    /// <summary>
    /// The segment the entry screen starts from: the number it will get, the survey date of the project's most
    /// recently added segment, the project's unit system, two blank stations and one blank shot.
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
            project.UnitSystem,
            [BlankStation(), BlankStation()],
            [new ShotResponse(Id: null, Distance: null, Azimuth: null, Note: null)]));

        static StationResponse BlankStation()
        {
            return new StationResponse(Id: null, Depth: null, Note: null);
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

        var input = SegmentValidator.Validate(request, ModelState);

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
                Depth = station.Depth,
                Note = station.Note,
            })],
            Shots = [.. input.Shots.Select((shot, index) => new Shot
            {
                Position = index + 1,
                Distance = shot.Distance,
                Azimuth = shot.Azimuth,
                Note = shot.Note,
            })],
        };

        dbContext.Segments.Add(segment);
        await dbContext.SaveChangesAsync();

        logger.LogInformation(
            "Created segment {SegmentId} with number {SegmentNumber} in project {ProjectId}",
            segment.Id, segment.Number, projectId);

        return CreatedAtAction(
            nameof(GetById), new { projectId, segmentId = segment.Id }, ToResponse(segment, project.UnitSystem));
    }

    /// <summary>
    /// The segment, with its readings in the project's unit system.
    /// </summary>
    [HttpGet("{segmentId:int}")]
    public async Task<ActionResult<SegmentResponse>> GetById(int projectId, int segmentId)
    {
        if (await FindSegmentAsync(projectId, segmentId, tracking: false) is not var (segment, unitSystem))
        {
            logger.LogWarning("Segment {SegmentId} not found in project {ProjectId}", segmentId, projectId);
            return NotFound();
        }

        return Ok(ToResponse(segment, unitSystem));
    }

    /// <summary>
    /// Replaces the whole segment. Stations and shots sent with an identity keep it, ones without are new, and saved
    /// ones left out are removed. The response is in the project's unit system, whichever one the request was in.
    /// </summary>
    [HttpPut("{segmentId:int}")]
    public async Task<ActionResult<SegmentResponse>> Replace(int projectId, int segmentId, [FromBody] SegmentRequest request)
    {
        if (await FindSegmentAsync(projectId, segmentId, tracking: true) is not var (segment, unitSystem))
        {
            logger.LogWarning("Segment {SegmentId} not found in project {ProjectId} for replacement", segmentId, projectId);
            return NotFound();
        }

        var input = SegmentValidator.Validate(request, ModelState, replacing: segment);

        if (input is null)
        {
            logger.LogWarning("Replacement of segment {SegmentId} in project {ProjectId} failed validation", segmentId, projectId);
            return ValidationProblem(ModelState);
        }

        // One save, so the replacement either wholly happens or changes nothing.
        SegmentReplacement.Apply(segment, input);
        await dbContext.SaveChangesAsync();

        logger.LogInformation("Replaced segment {SegmentId} in project {ProjectId}", segmentId, projectId);

        return Ok(ToResponse(segment, unitSystem));
    }

    /// <summary>
    /// Deletes the segment with its stations and shots. Its number isn't reused, since the project's counter only
    /// goes up.
    /// </summary>
    [HttpDelete("{segmentId:int}")]
    public async Task<IActionResult> Delete(int projectId, int segmentId)
    {
        // Loaded with its stations and shots, so they're removed with it even where the database doesn't cascade.
        if (await FindSegmentAsync(projectId, segmentId, tracking: true) is not var (segment, _))
        {
            logger.LogWarning("Segment {SegmentId} not found in project {ProjectId} for deletion", segmentId, projectId);
            return NotFound();
        }

        dbContext.Segments.Remove(segment);
        await dbContext.SaveChangesAsync();

        logger.LogInformation("Deleted segment {SegmentId} in project {ProjectId}", segmentId, projectId);

        return NoContent();
    }

    // The project's unit system, or null unless the project is the current user's.
    private Task<UnitSystem?> FindUnitSystemAsync(int projectId)
    {
        return dbContext.Projects
            .Where(item => item.Id == projectId)
            .Select(item => (UnitSystem?)item.UnitSystem)
            .FirstOrDefaultAsync();
    }

    // The segment with its stations and shots, and its project's unit system, or null unless both the project is the
    // current user's and the segment belongs to it.
    private async Task<(Segment Segment, UnitSystem UnitSystem)?> FindSegmentAsync(int projectId, int segmentId, bool tracking)
    {
        if (await FindUnitSystemAsync(projectId) is not UnitSystem unitSystem)
        {
            return null;
        }

        var segments = tracking ? dbContext.Segments : dbContext.Segments.AsNoTracking();

        var segment = await segments
            .Include(item => item.Stations)
            .Include(item => item.Shots)
            .AsSplitQuery()
            .FirstOrDefaultAsync(item => item.Id == segmentId && item.ProjectId == projectId);

        return segment is null ? null : (segment, unitSystem);
    }

    // Depths and distances are converted to the project's unit system.
    private static SegmentResponse ToResponse(Segment segment, UnitSystem unitSystem)
    {
        return new SegmentResponse(
            segment.Id,
            segment.Number,
            segment.SurveyDate,
            segment.Name,
            segment.Note,
            unitSystem,
            [.. segment.Stations
                .OrderBy(station => station.Position)
                .Select(station => new StationResponse(
                    station.Id, LengthUnits.FromMetres(station.Depth, unitSystem), station.Note))],
            [.. segment.Shots
                .OrderBy(shot => shot.Position)
                .Select(shot => new ShotResponse(
                    shot.Id, LengthUnits.FromMetres(shot.Distance, unitSystem), shot.Azimuth, shot.Note))]);
    }
}

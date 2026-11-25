namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A row in a project's list of segments.
/// </summary>
/// <param name="TotalLength">The sum of the shots' distances in metres, unrounded.</param>
public record SegmentSummary(
    int Id,
    int Number,
    string? Name,
    DateOnly SurveyDate,
    int StationCount,
    decimal TotalLength);

using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A row in a project's list of segments.
/// </summary>
/// <param name="TotalLength">The sum of the shots' distances in <paramref name="UnitSystem"/>, unrounded.</param>
/// <param name="UnitSystem">The project's unit system.</param>
public record SegmentSummary(
    int Id,
    int Number,
    string? Name,
    DateOnly SurveyDate,
    int StationCount,
    decimal TotalLength,
    UnitSystem UnitSystem);

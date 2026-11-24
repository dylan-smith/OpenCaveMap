using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A row in a project's list of segments.
/// </summary>
/// <param name="TotalLength">The sum of the shots' distances, as display text in <paramref name="UnitSystem"/>.</param>
/// <param name="UnitSystem">The project's unit system.</param>
public record SegmentSummary(
    int Id,
    int Number,
    string? Name,
    DateOnly SurveyDate,
    int StationCount,
    string TotalLength,
    UnitSystem UnitSystem);

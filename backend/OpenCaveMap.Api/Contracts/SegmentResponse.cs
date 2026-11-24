using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A segment ready to show in the entry screen, either saved or a blank new one (no ids yet). Readings are display
/// text.
/// </summary>
/// <param name="UnitSystem">The project's unit system, which the depths and distances are expressed in.</param>
public record SegmentResponse(
    int? Id,
    int Number,
    DateOnly? SurveyDate,
    string? Name,
    string? Note,
    UnitSystem UnitSystem,
    IReadOnlyList<StationResponse> Stations,
    IReadOnlyList<ShotResponse> Shots);

/// <param name="Depth">In the segment's unit system, or empty when it hasn't been entered.</param>
public record StationResponse(int? Id, string Label, string Depth, string? Note);

/// <param name="Distance">In the segment's unit system, or empty when it hasn't been entered.</param>
/// <param name="Azimuth">In degrees, or empty when it hasn't been entered.</param>
public record ShotResponse(int? Id, string Label, string Distance, string Azimuth, string? Note);

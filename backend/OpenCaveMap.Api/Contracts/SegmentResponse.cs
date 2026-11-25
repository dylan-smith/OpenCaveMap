using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A segment ready to show in the entry screen, either saved or a blank new one (no ids or readings yet). Stations
/// and shots are in order along the line, and readings are unrounded.
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

/// <param name="Depth">In the segment's unit system, or null when it hasn't been entered.</param>
public record StationResponse(int? Id, decimal? Depth, string? Note);

/// <param name="Distance">In the segment's unit system, or null when it hasn't been entered.</param>
/// <param name="Azimuth">In degrees, or null when it hasn't been entered.</param>
public record ShotResponse(int? Id, decimal? Distance, decimal? Azimuth, string? Note);

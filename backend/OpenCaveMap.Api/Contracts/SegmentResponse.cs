namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A segment ready to show in the entry screen, either saved or a blank new one (no ids or readings yet). Stations
/// and shots are in order along the line, and readings are as stored, unrounded.
/// </summary>
public record SegmentResponse(
    int? Id,
    int Number,
    DateOnly? SurveyDate,
    string? Name,
    string? Note,
    IReadOnlyList<StationResponse> Stations,
    IReadOnlyList<ShotResponse> Shots);

/// <param name="Depth">In metres, or null when it hasn't been entered.</param>
public record StationResponse(int? Id, decimal? Depth, string? Note);

/// <param name="Distance">In metres, or null when it hasn't been entered.</param>
/// <param name="Azimuth">In degrees, or null when it hasn't been entered.</param>
public record ShotResponse(int? Id, decimal? Distance, decimal? Azimuth, string? Note);

namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A segment ready to show in the entry screen, either saved or a blank new one (no ids yet). Readings are display
/// text.
/// </summary>
public record SegmentResponse(
    int? Id,
    int Number,
    DateOnly? SurveyDate,
    string? Name,
    string? Note,
    IReadOnlyList<StationResponse> Stations,
    IReadOnlyList<ShotResponse> Shots);

/// <param name="Depth">In metres, or empty when it hasn't been entered.</param>
public record StationResponse(int? Id, string Label, string Depth, string? Note);

/// <param name="Distance">In metres, or empty when it hasn't been entered.</param>
/// <param name="Azimuth">In degrees, or empty when it hasn't been entered.</param>
public record ShotResponse(int? Id, string Label, string Distance, string Azimuth, string? Note);

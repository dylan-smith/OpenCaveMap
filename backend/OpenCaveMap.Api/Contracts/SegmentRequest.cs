namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A whole segment to save. Everything is optional, so that the API, not the model binder, decides what's missing
/// and writes that message, keyed by its field.
/// </summary>
public class SegmentRequest
{
    public DateOnly? SurveyDate { get; set; }

    public string? Name { get; set; }

    public string? Note { get; set; }

    /// <summary>
    /// In order along the segment.
    /// </summary>
    public List<StationRequest?>? Stations { get; set; }

    /// <summary>
    /// In order along the segment: one fewer than the stations.
    /// </summary>
    public List<ShotRequest?>? Shots { get; set; }
}

public class StationRequest
{
    public int? Id { get; set; }

    /// <summary>
    /// In metres.
    /// </summary>
    public decimal? Depth { get; set; }

    public string? Note { get; set; }
}

public class ShotRequest
{
    public int? Id { get; set; }

    /// <summary>
    /// In metres.
    /// </summary>
    public decimal? Distance { get; set; }

    /// <summary>
    /// In degrees.
    /// </summary>
    public decimal? Azimuth { get; set; }

    public string? Note { get; set; }
}

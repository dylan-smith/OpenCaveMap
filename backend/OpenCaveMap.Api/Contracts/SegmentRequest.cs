namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A whole segment as the user typed it. Everything is optional text, so that the API, not the model binder, decides
/// what's missing or invalid and writes every message.
/// </summary>
public class SegmentRequest
{
    /// <summary>
    /// YYYY-MM-DD.
    /// </summary>
    public string? SurveyDate { get; set; }

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
    public string? Depth { get; set; }

    public string? Note { get; set; }
}

public class ShotRequest
{
    public int? Id { get; set; }

    /// <summary>
    /// In metres.
    /// </summary>
    public string? Distance { get; set; }

    /// <summary>
    /// In degrees.
    /// </summary>
    public string? Azimuth { get; set; }

    public string? Note { get; set; }
}

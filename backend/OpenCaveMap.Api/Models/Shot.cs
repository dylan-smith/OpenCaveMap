namespace OpenCaveMap.Api.Models;

/// <summary>
/// The measurement between two consecutive stations: shot n runs from station n-1 to station n.
/// </summary>
public class Shot
{
    public int Id { get; set; }

    public int SegmentId { get; set; }

    /// <summary>
    /// Counts from 1 along the segment.
    /// </summary>
    public int Position { get; set; }

    /// <summary>
    /// In metres (ADR 0001).
    /// </summary>
    public decimal Distance { get; set; }

    /// <summary>
    /// In degrees, from 0 up to but not including 360.
    /// </summary>
    public decimal Azimuth { get; set; }

    public string? Note { get; set; }
}

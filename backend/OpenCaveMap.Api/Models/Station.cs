namespace OpenCaveMap.Api.Models;

public class Station
{
    public int Id { get; set; }

    public int SegmentId { get; set; }

    /// <summary>
    /// Counts from 0 along the segment.
    /// </summary>
    public int Position { get; set; }

    /// <summary>
    /// In metres (ADR 0001).
    /// </summary>
    public decimal Depth { get; set; }

    public string? Note { get; set; }
}

using System.Globalization;

namespace OpenCaveMap.Api.Segments;

/// <summary>
/// Labels, and the display text for readings. Depths and distances are in metres (ADR 0001), azimuths in degrees.
/// </summary>
public static class Readings
{
    /// <summary>
    /// A station or shot's label: its segment's number and its position, joined by a dot (3.0).
    /// </summary>
    public static string Label(int segmentNumber, int position)
    {
        return string.Create(CultureInfo.InvariantCulture, $"{segmentNumber}.{position}");
    }

    /// <summary>
    /// A depth or distance rounded to at most two decimals, without trailing zeros (30, not 30.00).
    /// </summary>
    public static string FormatLength(decimal metres)
    {
        return Math.Round(metres, 2, MidpointRounding.AwayFromZero).ToString("0.##", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// An azimuth as stored, without trailing zeros.
    /// </summary>
    public static string FormatAzimuth(decimal degrees)
    {
        return degrees.ToString("0.###", CultureInfo.InvariantCulture);
    }
}

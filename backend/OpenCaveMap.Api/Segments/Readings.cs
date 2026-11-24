using System.Globalization;
using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Segments;

/// <summary>
/// Labels, conversion between units, and the display text for readings. Depths and distances are stored in metres
/// (ADR 0001) and entered and shown in a unit system. Azimuths are in degrees.
/// </summary>
public static class Readings
{
    // Exactly, by definition.
    private const decimal MetresPerFoot = 0.3048m;

    /// <summary>
    /// A station or shot's label: its segment's number and its position, joined by a dot (3.0).
    /// </summary>
    public static string Label(int segmentNumber, int position)
    {
        return string.Create(CultureInfo.InvariantCulture, $"{segmentNumber}.{position}");
    }

    /// <summary>
    /// A depth or distance entered in <paramref name="unitSystem"/>, in metres. It isn't rounded.
    /// </summary>
    public static decimal ToMetres(decimal value, UnitSystem unitSystem)
    {
        return unitSystem == UnitSystem.Imperial ? value * MetresPerFoot : value;
    }

    /// <summary>
    /// A depth or distance shown in <paramref name="unitSystem"/>: rounded to at most two decimals in metres or one in
    /// feet, half away from zero, without trailing zeros (30, not 30.00).
    /// </summary>
    public static string FormatLength(decimal metres, UnitSystem unitSystem)
    {
        var (value, decimals) = unitSystem == UnitSystem.Imperial ? (metres / MetresPerFoot, 1) : (metres, 2);

        return Math.Round(value, decimals, MidpointRounding.AwayFromZero).ToString("0.##", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// The depth or distance to store for a reading of a station or shot that is already saved. Display text is
    /// rounded, so a reading sent back exactly as it would be displayed in the request's unit system keeps the stored
    /// value instead of being replaced by the rounded one, even when it was saved in the other unit system. Any other
    /// text is stored as typed. New stations and shots are always stored as typed.
    /// </summary>
    public static decimal KeepUnlessChanged(decimal storedMetres, LengthReading reading, UnitSystem unitSystem)
    {
        return reading.Text == FormatLength(storedMetres, unitSystem) ? storedMetres : reading.Metres;
    }

    /// <summary>
    /// An azimuth as stored, without trailing zeros.
    /// </summary>
    public static string FormatAzimuth(decimal degrees)
    {
        return degrees.ToString("0.###", CultureInfo.InvariantCulture);
    }
}

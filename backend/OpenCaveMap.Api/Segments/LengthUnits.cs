using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Segments;

/// <summary>
/// Converts depths and distances between metres, which they're stored in (ADR 0001), and a unit system, which they're
/// sent and returned in. Neither direction rounds.
/// </summary>
public static class LengthUnits
{
    // Exactly, by definition.
    private const decimal MetresPerFoot = 0.3048m;

    public static decimal ToMetres(decimal value, UnitSystem unitSystem)
    {
        return unitSystem == UnitSystem.Imperial ? value * MetresPerFoot : value;
    }

    public static decimal FromMetres(decimal metres, UnitSystem unitSystem)
    {
        return unitSystem == UnitSystem.Imperial ? metres / MetresPerFoot : metres;
    }
}

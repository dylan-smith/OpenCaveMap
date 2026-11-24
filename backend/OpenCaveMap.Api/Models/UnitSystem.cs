using System.Text.Json.Serialization;

namespace OpenCaveMap.Api.Models;

/// <summary>
/// Whether a project's depths and distances are entered and shown in metres or in feet. It never changes a
/// measurement, which is always stored in metres (ADR 0001). In JSON it is "metric" or "imperial".
/// </summary>
[JsonConverter(typeof(UnitSystemJsonConverter))]
public enum UnitSystem
{
    [JsonStringEnumMemberName("metric")]
    Metric,

    [JsonStringEnumMemberName("imperial")]
    Imperial,
}

/// <summary>
/// Reads and writes a unit system by its name only. A number isn't accepted in its place, because any number would
/// be read as a unit system, including ones that don't exist.
/// </summary>
public sealed class UnitSystemJsonConverter() : JsonStringEnumConverter<UnitSystem>(namingPolicy: null, allowIntegerValues: false);

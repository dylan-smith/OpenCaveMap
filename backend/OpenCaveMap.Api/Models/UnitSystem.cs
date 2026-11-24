using System.Text.Json.Serialization;

namespace OpenCaveMap.Api.Models;

/// <summary>
/// Whether a project's depths and distances are entered and shown in metres or in feet. It never changes a
/// measurement, which is always stored in metres (ADR 0001). In JSON it is "metric" or "imperial".
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<UnitSystem>))]
public enum UnitSystem
{
    [JsonStringEnumMemberName("metric")]
    Metric,

    [JsonStringEnumMemberName("imperial")]
    Imperial,
}

public static class UnitSystems
{
    public const string UnknownMessage = "Unit system must be metric or imperial.";

    /// <summary>
    /// The unit system a request names, as it is written in JSON, or null when the text isn't one.
    /// </summary>
    /// <remarks>
    /// Requests carry it as text rather than as a <see cref="UnitSystem"/>, so that an unknown one is a validation
    /// message keyed by its field instead of a failure to read the request.
    /// </remarks>
    public static UnitSystem? Parse(string? text)
    {
        return text switch
        {
            "metric" => UnitSystem.Metric,
            "imperial" => UnitSystem.Imperial,
            _ => null,
        };
    }
}

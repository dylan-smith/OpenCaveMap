using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Contracts;

/// <summary>
/// A project to save. Everything is optional, so that the API, not the model binder, decides what's missing and writes
/// that message, keyed by its field.
/// </summary>
public class ProjectRequest
{
    public string? Name { get; set; }

    /// <summary>
    /// Optional: a new project is metric, and an update without one leaves it unchanged.
    /// </summary>
    public UnitSystem? UnitSystem { get; set; }
}

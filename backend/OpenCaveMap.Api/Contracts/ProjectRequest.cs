using System.ComponentModel.DataAnnotations;
using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Contracts;

public class ProjectRequest
{
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Optional: a new project is metric, and an update without one leaves it unchanged.
    /// </summary>
    public UnitSystem? UnitSystem { get; set; }
}

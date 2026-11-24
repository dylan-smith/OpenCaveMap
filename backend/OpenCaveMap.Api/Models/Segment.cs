namespace OpenCaveMap.Api.Models;

/// <summary>
/// A continuous run of stations joined by shots, surveyed in one go. Only reached through its project.
/// </summary>
public class Segment
{
    public int Id { get; set; }

    public int ProjectId { get; set; }

    // Only there for the query filter that limits segments to the current user's projects.
    public Project Project { get; set; } = null!;

    /// <summary>
    /// Issued from the project's counter when the segment is created, and never changed or reused.
    /// </summary>
    public int Number { get; set; }

    public DateOnly SurveyDate { get; set; }

    public string? Name { get; set; }

    public string? Note { get; set; }

    public List<Station> Stations { get; set; } = [];

    public List<Shot> Shots { get; set; } = [];
}

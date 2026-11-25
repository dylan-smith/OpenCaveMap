using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Segments;

/// <summary>
/// Replaces a saved segment's contents with a validated request, keeping the identity of every station and shot that
/// survives, so later features can refer to them.
/// </summary>
public static class SegmentReplacement
{
    /// <summary>
    /// Updates <paramref name="segment"/> in place. Its stations and shots must be loaded, and the input's identities
    /// must already have been checked against them (<see cref="SegmentValidator.Validate"/>).
    /// </summary>
    /// <remarks>
    /// A row sent with an identity updates that row, one without is new, and a saved row missing from the input is
    /// removed. Positions are rewritten from the order the rows arrive in. The segment's number never changes.
    /// </remarks>
    public static void Apply(Segment segment, ValidSegment input)
    {
        segment.SurveyDate = input.SurveyDate;
        segment.Name = input.Name;
        segment.Note = input.Note;

        var stations = Keep(segment.Stations, station => station.Id, input.Stations.Select(row => row.Id));
        foreach (var (row, position) in input.Stations.Select((row, index) => (row, index)))
        {
            var station = Match(segment.Stations, stations, row.Id);
            station.Position = position;
            station.Depth = row.Depth;
            station.Note = row.Note;
        }

        var shots = Keep(segment.Shots, shot => shot.Id, input.Shots.Select(row => row.Id));
        foreach (var (row, index) in input.Shots.Select((row, index) => (row, index)))
        {
            var shot = Match(segment.Shots, shots, row.Id);
            shot.Position = index + 1;
            shot.Distance = row.Distance;
            shot.Azimuth = row.Azimuth;
            shot.Note = row.Note;
        }
    }

    // Removes the saved rows the input leaves out, and returns the rest by identity.
    private static Dictionary<int, T> Keep<T>(List<T> saved, Func<T, int> id, IEnumerable<int?> inputIds)
    {
        var kept = inputIds.OfType<int>().ToHashSet();
        saved.RemoveAll(row => !kept.Contains(id(row)));
        return saved.ToDictionary(id);
    }

    // The saved row with this identity, or a new row added to the segment.
    private static T Match<T>(List<T> saved, Dictionary<int, T> byId, int? id)
        where T : new()
    {
        if (id is int value)
        {
            return byId[value];
        }

        var row = new T();
        saved.Add(row);
        return row;
    }
}

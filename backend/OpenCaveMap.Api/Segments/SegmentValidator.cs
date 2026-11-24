using Microsoft.AspNetCore.Mvc.ModelBinding;
using OpenCaveMap.Api.Contracts;
using OpenCaveMap.Api.Validation;

namespace OpenCaveMap.Api.Segments;

/// <summary>
/// A segment request that has passed every rule, ready to store. Readings are rounded to what the database keeps, and
/// names and notes are trimmed, with blank ones absent.
/// </summary>
public sealed record ValidSegment(
    DateOnly SurveyDate,
    string? Name,
    string? Note,
    IReadOnlyList<ValidStation> Stations,
    IReadOnlyList<ValidShot> Shots);

public sealed record ValidStation(int? Id, decimal Depth, string? Note);

public sealed record ValidShot(int? Id, decimal Distance, decimal Azimuth, string? Note);

/// <summary>
/// Validates a segment request and turns it into a <see cref="ValidSegment"/>. Each message is keyed by the camelCase
/// path of the field it belongs to (surveyDate, stations[1].depth, shots[0].azimuth), so the entry screen can put it
/// beside that field.
/// </summary>
public static class SegmentValidator
{
    public const int NameMaxLength = 200;
    public const int SegmentNoteMaxLength = 2000;
    public const int RowNoteMaxLength = 500;

    // Depths and distances are stored with six decimal places, azimuths with three.
    private const int LengthDecimals = 6;
    private const int AzimuthDecimals = 3;

    // Kept below this so they fit their storage.
    private const decimal LengthLimit = 100_000m;

    /// <summary>
    /// Returns the segment, or null after adding a message to <paramref name="errors"/> for every problem found.
    /// </summary>
    public static ValidSegment? Validate(SegmentRequest request, ModelStateDictionary errors)
    {
        var surveyDate = FieldRules.Required(request.SurveyDate, "surveyDate", "Survey date", errors);
        var name = FieldRules.OptionalText(request.Name, "name", "Name", NameMaxLength, errors);
        var note = FieldRules.OptionalText(request.Note, "note", "Note", SegmentNoteMaxLength, errors);

        var stationRequests = request.Stations ?? [];
        var shotRequests = request.Shots ?? [];

        if (stationRequests.Count < 2)
        {
            errors.AddModelError("stations", "A segment needs at least two stations.");
        }

        if (shotRequests.Count != stationRequests.Count - 1)
        {
            errors.AddModelError("shots", "A segment needs exactly one fewer shot than it has stations.");
        }

        var stations = stationRequests
            .Select((station, index) => ValidateStation(station, FieldRules.ItemKey("stations", index), errors))
            .ToList();

        var shots = shotRequests
            .Select((shot, index) => ValidateShot(shot, FieldRules.ItemKey("shots", index), errors))
            .ToList();

        // The survey date and every station and shot are present when nothing was rejected.
        return errors.IsValid
            ? new ValidSegment(surveyDate!.Value, name, note, stations!, shots!)
            : null;
    }

    private static ValidStation? ValidateStation(StationRequest? station, string path, ModelStateDictionary errors)
    {
        // A missing station is read as a blank one, so its depth is reported as required.
        station ??= new StationRequest();

        var depth = ValidateLength(station.Depth, $"{path}.depth", "Depth", allowZero: true, errors);
        var note = FieldRules.OptionalText(station.Note, $"{path}.note", "Note", RowNoteMaxLength, errors);

        return depth is decimal value ? new ValidStation(station.Id, value, note) : null;
    }

    private static ValidShot? ValidateShot(ShotRequest? shot, string path, ModelStateDictionary errors)
    {
        // A missing shot is read as a blank one, so its distance and azimuth are reported as required.
        shot ??= new ShotRequest();

        var distance = ValidateLength(shot.Distance, $"{path}.distance", "Distance", allowZero: false, errors);
        var azimuth = ValidateAzimuth(shot.Azimuth, $"{path}.azimuth", errors);
        var note = FieldRules.OptionalText(shot.Note, $"{path}.note", "Note", RowNoteMaxLength, errors);

        return distance is decimal distanceValue && azimuth is decimal azimuthValue
            ? new ValidShot(shot.Id, distanceValue, azimuthValue, note)
            : null;
    }

    private static decimal? ValidateLength(
        decimal? sent, string key, string reading, bool allowZero, ModelStateDictionary errors)
    {
        if (FieldRules.Required(sent, key, reading, errors) is not decimal value)
        {
            return null;
        }

        var metres = Math.Round(value, LengthDecimals, MidpointRounding.AwayFromZero);

        if (allowZero && value < 0)
        {
            errors.AddModelError(key, $"{reading} must be zero or more.");
            return null;
        }

        if (!allowZero && metres <= 0)
        {
            errors.AddModelError(key, $"{reading} must be more than zero.");
            return null;
        }

        if (metres >= LengthLimit)
        {
            errors.AddModelError(key, $"{reading} must be less than 100,000 m.");
            return null;
        }

        return metres;
    }

    // 360 is stored as 0, so due north is stored one way.
    private static decimal? ValidateAzimuth(decimal? sent, string key, ModelStateDictionary errors)
    {
        if (FieldRules.Required(sent, key, "Azimuth", errors) is not decimal value)
        {
            return null;
        }

        if (value is < 0 or > 360)
        {
            errors.AddModelError(key, "Azimuth must be from 0 to 360.");
            return null;
        }

        var degrees = Math.Round(value, AzimuthDecimals, MidpointRounding.AwayFromZero);

        return degrees == 360 ? 0 : degrees;
    }
}

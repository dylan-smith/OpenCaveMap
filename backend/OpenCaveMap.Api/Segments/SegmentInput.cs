using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using OpenCaveMap.Api.Contracts;

namespace OpenCaveMap.Api.Segments;

/// <summary>
/// A segment request that has been parsed and passed every rule, ready to store. Readings are rounded to what the
/// database keeps, and names and notes are trimmed, with blank ones absent.
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
/// Parses and validates a segment as the user typed it. Each message is keyed by the camelCase path of the field it
/// belongs to (surveyDate, stations[1].depth, shots[0].azimuth), so the entry screen can put it beside that field.
/// </summary>
public static partial class SegmentInput
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
    public static ValidSegment? Read(SegmentRequest request, ModelStateDictionary errors)
    {
        var surveyDate = ReadSurveyDate(request.SurveyDate, errors);
        var name = ReadText(request.Name, "name", "Name", NameMaxLength, errors);
        var note = ReadText(request.Note, "note", "Note", SegmentNoteMaxLength, errors);

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
            .Select((station, index) => ReadStation(station, $"stations[{index}]", errors))
            .ToList();

        var shots = shotRequests
            .Select((shot, index) => ReadShot(shot, $"shots[{index}]", errors))
            .ToList();

        // Every station and shot is present when nothing was rejected.
        return errors.IsValid
            ? new ValidSegment(surveyDate!.Value, name, note, stations!, shots!)
            : null;
    }

    private static ValidStation? ReadStation(StationRequest? station, string path, ModelStateDictionary errors)
    {
        var depth = ReadLength(station?.Depth, $"{path}.depth", "Depth", allowZero: true, errors);
        var note = ReadText(station?.Note, $"{path}.note", "Note", RowNoteMaxLength, errors);

        return depth is decimal value ? new ValidStation(station?.Id, value, note) : null;
    }

    private static ValidShot? ReadShot(ShotRequest? shot, string path, ModelStateDictionary errors)
    {
        var distance = ReadLength(shot?.Distance, $"{path}.distance", "Distance", allowZero: false, errors);
        var azimuth = ReadAzimuth(shot?.Azimuth, $"{path}.azimuth", errors);
        var note = ReadText(shot?.Note, $"{path}.note", "Note", RowNoteMaxLength, errors);

        return distance is decimal distanceValue && azimuth is decimal azimuthValue
            ? new ValidShot(shot?.Id, distanceValue, azimuthValue, note)
            : null;
    }

    private static DateOnly? ReadSurveyDate(string? text, ModelStateDictionary errors)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            errors.AddModelError("surveyDate", "Survey date is required.");
            return null;
        }

        if (!DateOnly.TryParseExact(text.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            errors.AddModelError("surveyDate", "Survey date must be a real date.");
            return null;
        }

        return date;
    }

    // Trimmed, and absent when blank.
    private static string? ReadText(string? text, string key, string field, int maxLength, ModelStateDictionary errors)
    {
        var trimmed = text?.Trim();

        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        if (trimmed.Length > maxLength)
        {
            errors.AddModelError(key, string.Create(CultureInfo.InvariantCulture, $"{field} must be {maxLength} characters or fewer."));
            return null;
        }

        return trimmed;
    }

    private static decimal? ReadLength(string? text, string key, string reading, bool allowZero, ModelStateDictionary errors)
    {
        if (!TryReadNumber(text, key, reading, errors, out var value))
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
    private static decimal? ReadAzimuth(string? text, string key, ModelStateDictionary errors)
    {
        if (!TryReadNumber(text, key, "Azimuth", errors, out var value))
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

    // A reading is a plain decimal number: surrounding spaces, leading zeros and a dot as the decimal separator are
    // fine, but thousands separators and exponents aren't. A sign is allowed so that "-2" gets the range message.
    private static bool TryReadNumber(string? text, string key, string reading, ModelStateDictionary errors, out decimal value)
    {
        value = 0;

        if (string.IsNullOrWhiteSpace(text))
        {
            errors.AddModelError(key, $"{reading} is required.");
            return false;
        }

        var trimmed = text.Trim();

        if (!PlainDecimal().IsMatch(trimmed))
        {
            errors.AddModelError(key, $"{reading} must be a number, such as 12.5.");
            return false;
        }

        if (!decimal.TryParse(trimmed, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out value))
        {
            // Too many digits for a decimal, so far outside every range.
            value = trimmed.StartsWith('-') ? decimal.MinValue : decimal.MaxValue;
        }

        return true;
    }

    [GeneratedRegex(@"^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$", RegexOptions.CultureInvariant)]
    private static partial Regex PlainDecimal();
}

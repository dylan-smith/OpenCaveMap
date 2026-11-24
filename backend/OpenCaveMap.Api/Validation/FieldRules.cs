using System.Globalization;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace OpenCaveMap.Api.Validation;

/// <summary>
/// The checks that validators share, so that every entity's messages are worded the same way. A check that fails
/// adds its message to <c>errors</c> under <c>key</c>, the camelCase path of the field in the request (name,
/// stations[1].note), so that a screen can put the message beside that field.
/// </summary>
public static class FieldRules
{
    /// <summary>
    /// The value, or null after adding "{label} is required."
    /// </summary>
    public static T? Required<T>(T? value, string key, string label, ModelStateDictionary errors)
        where T : struct
    {
        if (value is null)
        {
            errors.AddModelError(key, $"{label} is required.");
        }

        return value;
    }

    /// <summary>
    /// The text trimmed, or null when it's blank. Null after adding a message when it's longer than
    /// <paramref name="maxLength"/> once trimmed.
    /// </summary>
    public static string? OptionalText(
        string? text, string key, string label, int maxLength, ModelStateDictionary errors)
    {
        var trimmed = text?.Trim();

        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        if (trimmed.Length > maxLength)
        {
            errors.AddModelError(key, string.Create(CultureInfo.InvariantCulture, $"{label} must be {maxLength} characters or fewer."));
            return null;
        }

        return trimmed;
    }

    /// <summary>
    /// The key of the item at <paramref name="index"/> in a list (stations[1]), which its fields' keys start with.
    /// </summary>
    public static string ItemKey(string list, int index)
    {
        return string.Create(CultureInfo.InvariantCulture, $"{list}[{index}]");
    }
}

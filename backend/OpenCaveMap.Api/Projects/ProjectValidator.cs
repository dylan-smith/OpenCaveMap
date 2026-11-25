using Microsoft.AspNetCore.Mvc.ModelBinding;
using OpenCaveMap.Api.Contracts;
using OpenCaveMap.Api.Models;
using OpenCaveMap.Api.Validation;

namespace OpenCaveMap.Api.Projects;

/// <summary>
/// A project request that has passed every rule, ready to store. The name is trimmed, and the unit system is absent
/// when the request didn't give one.
/// </summary>
public sealed record ValidProject(string Name, UnitSystem? UnitSystem);

/// <summary>
/// Validates a project request and turns it into a <see cref="ValidProject"/>. Each message is keyed by the camelCase
/// name of its field.
/// </summary>
/// <remarks>
/// Whether another of the user's projects has the name is checked when the project is saved, because it's answered
/// with a conflict rather than a validation message.
/// </remarks>
public static class ProjectValidator
{
    public const int NameMaxLength = 200;

    /// <summary>
    /// Returns the project, or null after adding a message to <paramref name="errors"/> for every problem found.
    /// </summary>
    public static ValidProject? Validate(ProjectRequest request, ModelStateDictionary errors)
    {
        var name = FieldRules.RequiredText(request.Name, "name", "Project name", NameMaxLength, errors);

        // The name is present when nothing was rejected.
        return errors.IsValid ? new ValidProject(name!, request.UnitSystem) : null;
    }
}

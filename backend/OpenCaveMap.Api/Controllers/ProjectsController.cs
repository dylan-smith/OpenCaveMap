using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OpenCaveMap.Api.Contracts;
using OpenCaveMap.Api.Data;
using OpenCaveMap.Api.Models;
using OpenCaveMap.Api.Projects;

namespace OpenCaveMap.Api.Controllers;

/// <remarks>
/// Log statements use structured logging with typed route parameters (e.g. int id) only.
/// User-provided strings such as project names are intentionally excluded to prevent log-forging.
/// </remarks>
[ApiController]
[Route("api/[controller]")]
public class ProjectsController(OpenCaveMapDbContext dbContext, ILogger<ProjectsController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Project>>> GetAll()
    {
        logger.LogInformation("Retrieving all projects");

        var projects = await dbContext.Projects
            .AsNoTracking()
            .OrderBy(project => project.Name)
            .ToListAsync();

        logger.LogInformation("Retrieved {Count} projects", projects.Count);

        return Ok(projects);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Project>> GetById(int id)
    {
        logger.LogInformation("Retrieving project {ProjectId}", id);

        var project = await dbContext.Projects
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == id);

        if (project is null)
        {
            logger.LogWarning("Project {ProjectId} not found", id);
            return NotFound();
        }

        return Ok(project);
    }

    [HttpPost]
    public async Task<ActionResult<Project>> Create([FromBody] ProjectRequest request)
    {
        var input = ProjectValidator.Validate(request, ModelState);

        if (input is null)
        {
            logger.LogWarning("Project creation failed validation");
            return ValidationProblem(ModelState);
        }

        var duplicateName = await HasDuplicateNameAsync(input.Name);

        if (duplicateName)
        {
            logger.LogWarning("Project creation failed due to duplicate name");
            return Conflict(new { message = "A project with this name already exists." });
        }

        var project = new Project
        {
            Name = input.Name,
            UnitSystem = input.UnitSystem ?? UnitSystem.Metric,
        };

        dbContext.Projects.Add(project);
        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            var isDuplicateName = await HasDuplicateNameAsync(input.Name);

            if (isDuplicateName)
            {
                logger.LogWarning("Project creation failed due to concurrent duplicate name");
                return Conflict(new { message = "A project with this name already exists." });
            }

            throw;
        }

        logger.LogInformation("Created project {ProjectId}", project.Id);

        return CreatedAtAction(nameof(GetById), new { id = project.Id }, project);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<Project>> Update(int id, [FromBody] ProjectRequest request)
    {
        var project = await dbContext.Projects.FirstOrDefaultAsync(item => item.Id == id);

        if (project is null)
        {
            logger.LogWarning("Project {ProjectId} not found for update", id);
            return NotFound();
        }

        var input = ProjectValidator.Validate(request, ModelState);

        if (input is null)
        {
            logger.LogWarning("Project {ProjectId} update failed validation", id);
            return ValidationProblem(ModelState);
        }

        var duplicateName = await HasDuplicateNameAsync(input.Name, id);

        if (duplicateName)
        {
            logger.LogWarning("Project {ProjectId} update failed due to duplicate name", id);
            return Conflict(new { message = "A project with this name already exists." });
        }

        project.Name = input.Name;
        project.UnitSystem = input.UnitSystem ?? project.UnitSystem;

        try
        {
            await dbContext.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            var isDuplicateName = await HasDuplicateNameAsync(input.Name, id);

            if (isDuplicateName)
            {
                logger.LogWarning("Project {ProjectId} update failed due to concurrent duplicate name", id);
                return Conflict(new { message = "A project with this name already exists." });
            }

            throw;
        }

        logger.LogInformation("Updated project {ProjectId}", id);

        return Ok(project);
    }

    private async Task<bool> HasDuplicateNameAsync(string name, int? excludeId = null)
    {
        var query = dbContext.Projects.AsNoTracking();

        if (excludeId is int id)
        {
            query = query.Where(item => item.Id != id);
        }

        return dbContext.Database.IsSqlServer()
            ? await query.AnyAsync(item => item.Name == name)
            : await query.AnyAsync(item =>
                string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var project = await dbContext.Projects.FirstOrDefaultAsync(item => item.Id == id);

        if (project is null)
        {
            logger.LogWarning("Project {ProjectId} not found for deletion", id);
            return NotFound();
        }

        dbContext.Projects.Remove(project);
        await dbContext.SaveChangesAsync();

        logger.LogInformation("Deleted project {ProjectId}", id);

        return NoContent();
    }
}

using Microsoft.EntityFrameworkCore;
using OpenCaveMap.Api.Authentication;
using OpenCaveMap.Api.Models;

namespace OpenCaveMap.Api.Data;

/// <remarks>
/// Projects belong to a user. A query filter only shows the current user's, and new ones are given the current user
/// when they're saved, so the controllers never handle the owner themselves.
/// </remarks>
public class OpenCaveMapDbContext(DbContextOptions<OpenCaveMapDbContext> options, CurrentUser currentUser) : DbContext(options)
{
    // Read by the query filters each time a query runs, so it's this request's user.
    private int? CurrentUserId => currentUser.UserId;

    public DbSet<User> Users => Set<User>();

    public DbSet<Project> Projects => Set<Project>();

    public DbSet<Segment> Segments => Set<Segment>();

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        AssignOwner();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        AssignOwner();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void AssignOwner()
    {
        foreach (var entry in ChangeTracker.Entries().Where(entry => entry.State == EntityState.Added))
        {
            if (entry.Entity is Project project)
            {
                project.UserId = CurrentUserId ?? throw NoCurrentUser();
            }
        }

        static InvalidOperationException NoCurrentUser()
        {
            return new("Projects can only be saved for a signed-in user.");
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>()
            .HasIndex(user => user.Subject)
            .IsUnique();

        modelBuilder.Entity<User>()
            .Property(user => user.Subject)
            .HasMaxLength(255)
            .IsRequired();

        modelBuilder.Entity<User>()
            .Property(user => user.Email)
            .HasMaxLength(320);

        modelBuilder.Entity<User>()
            .Property(user => user.DisplayName)
            .HasMaxLength(200);

        modelBuilder.Entity<Project>()
            .HasQueryFilter(project => project.UserId == CurrentUserId);

        modelBuilder.Entity<Project>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(project => project.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Names only have to be unique among one user's projects.
        modelBuilder.Entity<Project>()
            .HasIndex(project => new { project.UserId, project.Name })
            .IsUnique();

        modelBuilder.Entity<Project>()
            .Property(project => project.Name)
            .HasMaxLength(200)
            .IsRequired();

        // Segments have no query filter of their own: they're only reached through a project, which has one.
        modelBuilder.Entity<Segment>(segment =>
        {
            segment.HasOne<Project>()
                .WithMany()
                .HasForeignKey(item => item.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            segment.HasIndex(item => new { item.ProjectId, item.Number })
                .IsUnique();

            segment.Property(item => item.Name)
                .HasMaxLength(200);

            segment.Property(item => item.Note)
                .HasMaxLength(2000);

            segment.HasMany(item => item.Stations)
                .WithOne()
                .HasForeignKey(station => station.SegmentId)
                .OnDelete(DeleteBehavior.Cascade);

            segment.HasMany(item => item.Shots)
                .WithOne()
                .HasForeignKey(shot => shot.SegmentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Positions aren't unique, because one save renumbers several rows together.
        modelBuilder.Entity<Station>(station =>
        {
            station.ToTable("Stations");

            station.HasIndex(item => new { item.SegmentId, item.Position });

            station.Property(item => item.Depth)
                .HasPrecision(11, 6);

            station.Property(item => item.Note)
                .HasMaxLength(500);
        });

        modelBuilder.Entity<Shot>(shot =>
        {
            shot.ToTable("Shots");

            shot.HasIndex(item => new { item.SegmentId, item.Position });

            shot.Property(item => item.Distance)
                .HasPrecision(11, 6);

            shot.Property(item => item.Azimuth)
                .HasPrecision(6, 3);

            shot.Property(item => item.Note)
                .HasMaxLength(500);
        });
    }
}

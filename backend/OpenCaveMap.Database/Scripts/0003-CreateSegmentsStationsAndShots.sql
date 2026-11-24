-- The last segment number a project issued. Numbers are never reused, even after a segment is deleted.
ALTER TABLE [dbo].[Projects]
    ADD [LastSegmentNumber] INT NOT NULL
        CONSTRAINT [DF_Projects_LastSegmentNumber] DEFAULT 0;

-- A continuous run of stations joined by shots, surveyed in one go.
CREATE TABLE [dbo].[Segments] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [ProjectId] INT NOT NULL,
    [Number] INT NOT NULL,
    [SurveyDate] DATE NOT NULL,
    [Name] NVARCHAR(200) NULL,
    [Note] NVARCHAR(2000) NULL,
    CONSTRAINT [PK_Segments] PRIMARY KEY CLUSTERED ([Id] ASC),
    CONSTRAINT [FK_Segments_Projects_ProjectId] FOREIGN KEY ([ProjectId])
        REFERENCES [dbo].[Projects] ([Id]) ON DELETE CASCADE
);

CREATE UNIQUE NONCLUSTERED INDEX [IX_Segments_ProjectId_Number]
    ON [dbo].[Segments] ([ProjectId] ASC, [Number] ASC);

-- Depths are in metres (ADR 0001). Positions count from 0 and aren't unique, because one save renumbers several
-- stations together.
CREATE TABLE [dbo].[Stations] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [SegmentId] INT NOT NULL,
    [Position] INT NOT NULL,
    [Depth] DECIMAL(11, 6) NOT NULL,
    [Note] NVARCHAR(500) NULL,
    CONSTRAINT [PK_Stations] PRIMARY KEY CLUSTERED ([Id] ASC),
    CONSTRAINT [FK_Stations_Segments_SegmentId] FOREIGN KEY ([SegmentId])
        REFERENCES [dbo].[Segments] ([Id]) ON DELETE CASCADE
);

CREATE NONCLUSTERED INDEX [IX_Stations_SegmentId_Position]
    ON [dbo].[Stations] ([SegmentId] ASC, [Position] ASC);

-- Distances are in metres and azimuths in degrees. Positions count from 1: shot n joins station n-1 to station n.
CREATE TABLE [dbo].[Shots] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [SegmentId] INT NOT NULL,
    [Position] INT NOT NULL,
    [Distance] DECIMAL(11, 6) NOT NULL,
    [Azimuth] DECIMAL(6, 3) NOT NULL,
    [Note] NVARCHAR(500) NULL,
    CONSTRAINT [PK_Shots] PRIMARY KEY CLUSTERED ([Id] ASC),
    CONSTRAINT [FK_Shots_Segments_SegmentId] FOREIGN KEY ([SegmentId])
        REFERENCES [dbo].[Segments] ([Id]) ON DELETE CASCADE
);

CREATE NONCLUSTERED INDEX [IX_Shots_SegmentId_Position]
    ON [dbo].[Shots] ([SegmentId] ASC, [Position] ASC);

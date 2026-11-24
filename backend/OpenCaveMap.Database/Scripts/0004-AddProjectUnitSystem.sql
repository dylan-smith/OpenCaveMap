-- Whether a project's depths and distances are entered and shown in metres or feet. They're stored in metres either
-- way (ADR 0001). Existing projects are metric.
ALTER TABLE [dbo].[Projects]
    ADD [UnitSystem] NVARCHAR(10) NOT NULL
        CONSTRAINT [DF_Projects_UnitSystem] DEFAULT N'Metric'
        CONSTRAINT [CK_Projects_UnitSystem] CHECK ([UnitSystem] IN (N'Metric', N'Imperial'));

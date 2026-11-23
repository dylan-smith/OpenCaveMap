using './preview-shared.bicep'

// Values for the resources shared by every preview environment in the OpenCaveMap-Preview resource group. CI
// deploys these from the PR's base branch, so a change here reaches previews once it's merged.
param location = 'westus2'

param appServicePlanName = 'OpenCaveMap-Preview-Plan'
param appServicePlanSku = 'F1'
param sqlServerName = 'opencavemap-preview-sql'

// The opencavemap-preview-deploy managed identity (see README, Identities & Permissions)
param sqlEntraAdminLogin = 'opencavemap-preview-deploy'
param sqlEntraAdminObjectId = '8d29b323-a311-4428-be77-c6e580296737'

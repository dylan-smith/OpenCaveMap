using './preview-shared.bicep'

// Values for the resources shared by every preview environment in the OpenCaveMap-Preview resource group. CI
// deploys these from the PR's base branch, so a change here reaches previews once it's merged.
param location = 'westus2'

param appServicePlanName = 'OpenCaveMap-Preview-Plan'
param appServicePlanSku = 'F1'
param sqlServerName = 'opencavemap-preview-sql'

// The opencavemap-preview-deploy managed identity (see README, Identities & Permissions). Replace the placeholder
// with the identity's object (principal) ID once it's created; previews can't deploy until then.
param sqlEntraAdminLogin = 'opencavemap-preview-deploy'
param sqlEntraAdminObjectId = '00000000-0000-0000-0000-000000000000'

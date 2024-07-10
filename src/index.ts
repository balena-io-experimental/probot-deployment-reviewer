import { Probot } from "probot";
import { DeploymentReviewRequestedEvent } from "@octokit/webhooks-types";

const approvalComment =
  "👍 Automatically approved by Probot Deployment Reviewer";

const approve = async (
  _context: any,
  _environmentName: string,
  _workflowRunId: any
) => {
  // get environment id from the environment name
  const { data: environment } =
    await _context.octokit.rest.repos.getEnvironment({
      owner: _context.repo().owner,
      repo: _context.repo().repo,
      environment_name: _environmentName,
    });

  _context.log.info(
    `Approving deployment for environment '${_environmentName}'`
  );

  await _context.octokit.rest.actions.reviewPendingDeploymentsForRun({
    owner: _context.repo().owner,
    repo: _context.repo().repo,
    run_id: _workflowRunId,
    environment_ids: [environment.id],
    state: "approved",
    comment: approvalComment,
  });
};

export default (app: Probot) => {
  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
  app.on("deployment_review.requested", async (context) => {
    const {
      environment: environmentName,
      reviewers,
      requestor,
      workflow_run: workflowRun,
    } = context.payload as DeploymentReviewRequestedEvent;

    if (!workflowRun) {
      context.log.error(`No workflow run found in the payload`);
      return;
    }

    context.log.info(
      `Deployment requested by '${requestor.login}' of type '${requestor.type}'`
    );

    if (requestor.type === "Organization") {
      context.log.error(`Organization requestors are not supported`);
      return;
    }

    if (requestor.type === "Bot") {
      context.log.info(`Skipping reviewer check for bot requestor`);
      await approve(context, environmentName, workflowRun.id);
      return;
    }

    context.log.info(
      `Reviewers: ${reviewers
        .map((reviewer) => reviewer.reviewer.name)
        .join(", ")}`
    );

    for (const reviewer of reviewers) {
      if (reviewer.type === "User") {
        if (reviewer.reviewer.id === requestor.id) {
          context.log.info(`Requestor is a reviewer`);
          await approve(context, environmentName, workflowRun.id);
          return;
        }
        break;
      }

      if (reviewer.type === "Team") {
        try {
          const { data: membership } =
            await context.octokit.rest.teams.getMembershipForUserInOrg({
              org: context.repo().owner,
              team_slug: reviewer.reviewer.slug,
              username: requestor.login,
            });
          if (membership && membership.state === "active") {
            context.log.info(
              `Requestor is a member of team '${reviewer.reviewer.slug}'`
            );
            await approve(context, environmentName, workflowRun.id);
            return;
          }
        } catch (error) {
          if ((error as any).status !== 404) {
            throw error;
          }
        }
      }
    }

    context.log.info(`Requestor '${requestor.login}' is not a reviewer`);
    return;
  });
};

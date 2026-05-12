//Setup
export default async function({login, imports, data, rest, q, account}, {enabled = false, extras = false} = {}) {
  //Plugin execution
  try {
    //Check if plugin is enabled and requirements are met
    if ((!q.traffic) || (!imports.metadata.plugins.traffic.enabled(enabled, {extras})))
      return null

    //Load inputs
    let {skipped} = imports.metadata.plugins.traffic.inputs({data, account, q})
    skipped.push(...data.shared["repositories.skipped"])

    //Repositories
    const repositories = data.user.repositories.nodes.map(({name: repo, owner: {login: owner}}) => ({repo, owner})) ?? []
    console.debug(`metrics/compute/${login}/plugins > traffic > ${repositories.length} repositories available`)

    //Get views stats from repositories
    console.debug(`metrics/compute/${login}/plugins > traffic > querying api`)
    const views = {count: 0, uniques: 0}
    const promised = [...await Promise.allSettled(repositories.map(({repo, owner}) => imports.filters.repo(`${owner}/${repo}`, skipped) ? rest.repos.getViews({owner, repo}) : {}))]
    const response = promised.filter(({status}) => status === "fulfilled").map(({value}) => value)
    const skippedCount = promised.length - response.filter(({data}) => data !== undefined).length
    console.debug(`metrics/compute/${login}/plugins > traffic > ${response.length} fulfilled, ${promised.filter(({status}) => status === "rejected").length} rejected, ${skippedCount} skipped`)

    //Handle error if all promises were rejected
    const rejected = promised.filter(({status}) => status === "rejected")
    if (rejected.length > 0 && rejected.length === promised.length) {
      const reasons = rejected.map(({reason}) => reason.message)
      console.debug(`metrics/compute/${login}/plugins > traffic > all requests failed: ${reasons.join(", ")}`)
      if (reasons.every(error => /must have push access to repository/i.test(error)))
        throw {error: {message: "Insufficient token scopes", instance: rejected[0].reason}}
      throw new Error(rejected[0].reason.message)
    }
    else if (rejected.length) {
      rejected.map(({reason}) => console.debug(`metrics/compute/${login}/plugins > traffic > warn > ${reason.message}`))
    }

    //Compute views
    console.debug(`metrics/compute/${login}/plugins > traffic > computing stats`)
    response.filter(({data}) => data).map(({data: {count, uniques}}) => (views.count += count, views.uniques += uniques))

    //Results
    return {views}
  }
  //Handle errors
  catch (error) {
    throw imports.format.error(error, {descriptions: {"403": "Insufficient token scopes"}})
  }
}

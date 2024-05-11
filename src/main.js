const core = require('@actions/core')
const http = require('https')
const fs = require('fs')

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const label = core.getInput('label')
    const format = core.getInput('format', { required: true })
    const report = core.getInput('report', { required: true })
    const color = core.getInput('color')
    const gistFilename = core.getInput('gist-filename')
    const gistId = core.getInput('gist-id')
    const gistAuthToken = core.getInput('gist-auth-token')

    const testReport = readFile(report)

    const coveragePercentage = extractCoveragePercentage(testReport, format)

    core.debug(`Determined the covarage to be ${coveragePercentage}`)

    const badgeData = createBadgeData(label, coveragePercentage, color)

    core.debug(`badge data to be published ${badgeData}`)

    publishBadge(badgeData, gistFilename, gistId, gistAuthToken)

    core.setOutput('badge', badgeData)
    core.setOutput('percentage', coveragePercentage)
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error.message)
  }
}

function publishBadge(badgeData, gistFilename, gistId, gistAuthToken) {
  if (gistFilename == null || gistId == null || gistAuthToken == null) {
    console.log(
      'Could not publish badge. Gist filename, id and auth token are required to post shields.io data'
    )
  } else {
    console.log('Posting shields.io data to Gist')
    postGist(badgeData, gistFilename, gistId, gistAuthToken)
    console.log('Posted shields.io data to Gist')
  }
}

function postGist(badgeData, gistFilename, gistId, gistAuthToken) {
  const request = JSON.stringify({
    files: { [gistFilename]: { content: JSON.stringify(badgeData) } }
  })

  const req = http.request(
    {
      host: 'api.github.com',
      path: `/gists/${gistId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': request.length,
        'User-Agent': 'simon-k',
        Authorization: `token ${gistAuthToken}`
      }
    },
    res => {
      let body = ''
      res.on('data', data => (body += data))
      res.on('end', () => console.log(`result:${body}`))
    }
  )

  req.write(request)
  req.end()
}

function createBadgeData(label, coveragePercentage, color) {
  const badgeData = {
    schemaVersion: 1,
    label,
    message: `${coveragePercentage}%`,
    color
  }

  return badgeData
}

function readFile(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`The file was not found at the location: "${path}"`)
  }

  return fs.readFileSync(path, 'utf8')
}

function extractCoveragePercentage(reportContent, format) {
  switch (format) {
    case 'opencover':
      return extractSummaryFromOpencover(reportContent)
    case 'cobertura':
      return extractSummaryFromCobertura(reportContent)
    default:
      throw new Error(
        'the given format is not supported. Supported formats are: opencover, cobertura'
      )
  }
}

function extractSummaryFromOpencover(content) {
  const rx = /(?<=sequenceCoverage=")\d*\.*\d*(?=")/m
  const arr = rx.exec(content)

  if (arr == null) {
    throw new Error(
      'No code coverage percentage was found in the provided opencover report. Was looking for an xml elemet named Summary with the attribute sequenceCoverage'
    )
  }

  return arr[0]
}

function extractSummaryFromCobertura(content) {
  const lineRateRegex = /<coverage.*?line-rate="([^"]*)".*?>/s
  const match = content.match(lineRateRegex)

  if (!match) {
    throw new Error(
      'No line rate was found in the provided Cobertura report. Was looking for an xml element named coverage with the attribute line-rate'
    )
  }

  return (Math.round(parseFloat(match[1]) * 10000) / 100).toString()
}

module.exports = {
  run
}

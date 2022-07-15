let Jasmine = require('jasmine');
let colors = require('colors');
let fs = require('fs');
let path = require('path');
let url = require('url');

function main(projectDirectory) {
  let jasmine = new Jasmine();
  jasmine.loadConfig({
    spec_dir: path.relative("", projectDirectory),
    spec_files: ["!node_modules/**", "**/test-*.js", "**/test-*.mjs"],
    stopSpecOnExpectationFailure: true,
    random: false
  });

  jasmine.clearReporters();
  jasmine.addReporter(new BasicReporter());
  let { fileNames, testNames } = parseCommandLineOptions();
  jasmine.execute(fileNames, testNames);
}

exports.main = main;

function parseCommandLineOptions() {
  let options = process.argv.slice(2);

  let fileNames = [];
  let testNames = [];
  for (let option of options) {
    if (fs.existsSync(option)) {
      fileNames.push(option);
    } else {
      testNames.push(option);
    }
  }
  if (testNames.length > 1) {
    console.error(
      `${colors.red("ERROR")} only one test name filter is allowed`
    );
    process.exit(1);
  }
  return { fileNames, testNames };
}

class BasicReporter {
  constructor() {
    this._executedTests = 0;
  }

  jasmineStarted(_summary) {}

  jasmineDone(summary) {
    switch (summary.overallStatus) {
      case "passed":
        if (this._executedTests === 0) {
          console.error(`${colors.red("ERROR")} no tests executed`);
          process.exit(1);
        }
        break;

      case "incomplete":
        console.error(`${colors.red("ERROR")} ${summary.incompleteReason}`);
        process.exit(1);
        break;

      case "failed":
        // specDone should have killed the process already.
        console.error(`${colors.red("ERROR")} tests failed`);
        process.exit(1);
        break;

      default:
        console.error(
          `${colors.red("ERROR")} unknown status: ${summary.overallStatus}`
        );
        process.exit(1);
        break;
    }
  }

  suiteStarted(_suite) {}

  suiteDone(_suite) {}

  specStarted(spec) {
    console.error(`Running ${spec.fullName} ...`);
  }

  specDone(spec) {
    switch (spec.status) {
      case "passed":
        console.error(`${colors.green("OK")}      ${spec.fullName}`);
        this._executedTests += 1;
        break;

      case "excluded":
        console.error(`${colors.yellow("SKIP")}    ${spec.fullName}`);
        break;

      default:
      case "failed":
        for (let failure of spec.failedExpectations) {
          console.error(failure.stack);
        }
        console.error(`${colors.red("FAIL")}    ${spec.fullName}`);
        process.exit(1);
        break;
    }
  }
}
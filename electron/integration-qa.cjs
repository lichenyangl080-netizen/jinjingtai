exports.run = async (win, errors) => {
  if (!process.env.JINJINGTAI_QA_HOME_RESTART)
    throw Error(
      "QA_MODE_REQUIRED: select a current daily-home acceptance mode",
    );
  return require("./daily-home-qa.cjs").run(win, errors);
};

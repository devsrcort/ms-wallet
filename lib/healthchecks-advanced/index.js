const Duration = require('duration');

class Checks {
    async dbCheck() {
        const start = new Date();
        // const conn = await db.conn();
        // const query = 'select count(1) from wallets';

        const response = {};

        const elapsed = new Duration(start, new Date());
        const status = 'pass';

        response.status = status;
        response.metricValue = elapsed.milliseconds;
        response.metricUnit = "ms";

        return response;
    }
}

module.exports = Checks;
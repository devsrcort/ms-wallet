const queue = require('queue');

class TxEmitterService {
    constructor() {
        this.myQueue = queue({
            concurrency: 1,
            autostart: true,
            results: []
        });

        this.myQueue.start(function(err) {
            if (err) throw err;
        })
    }

    addSuccessCallback(cb) {
        this.myQueue.on('success', cb);
    }

    removeSuccessCallback(cb) {
        this.myQueue.removeListener('success', cb);
    }

    push(cb) {
        this.myQueue.push(cb);
    }
}

module.exports = TxEmitterService;
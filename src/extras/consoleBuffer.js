//Requires
const fs = require('fs');
const chalk = require('chalk');
const StreamSnitch = require('stream-snitch');
const prettyBytes = require('pretty-bytes');
const { dir, log, logOk, logWarn, logError, cleanTerminal } = require('../extras/console');
const context = 'ConsoleBuffer';

/**
 * FXServer output buffer helper.
 *
 * FIXME: optimize this, we can have only one buffer using offset variables
 * @param {string} logPath
 * @param {int} saveInterval
 */
module.exports = class ConsoleBuffer {
    constructor(logPath, saveInterval) {
        this.hitchStreamProcessor = null;
        this.detectMissingResource = null;
        this.logFileSize = null;
        this.logPath = logPath;
        this.enableCmdBuffer = false;
        this.cmdBuffer = '';
        this.webConsoleBuffer = '';
        this.fileBuffer = '';
        this.setupStreamHandlers();

        //Start log file
        try {
            fs.writeFileSync(this.logPath, '');
        } catch (error) {
            logError(`Failed to create log file '${this.logPath}' with error: ${error.message}`, context)
        }

        //Cron Function
        setInterval(this.saveLog.bind(this), saveInterval*1000);
    }


    //================================================================
    /**
     * Setup the stream handlers
     */
    setupStreamHandlers(){
        this.hitchStreamProcessor = new StreamSnitch(
            /hitch warning: frame time of (\d{3,5}) milliseconds/g,
            (m) => {
                try {
                    globals.monitor.processFXServerHitch(m[1])
                }catch(e){}
            }
        );
        this.hitchStreamProcessor.on('error', (data) => {});

        this.detectMissingResource = new StreamSnitch(
            // /Couldn't find resource txAdminClient./g,
            /\[txAdminClient\] Version 1\.[^1]\.0 starting/g,
            (m) => {
                try {
                    globals.resourceWrongVersion = true;
                }catch(e){}
            }
        );
        this.detectMissingResource.on('error', (data) => {});
    }//Final setupStreamHandlers()


    //================================================================
    /**
     * Write data to all buffers
     * @param {string} data
     * @param {string} markType
     */
    write(data, markType) {
        if(typeof markType === 'undefined') markType = false;
        //NOTE: not sure how this would throw any errors, but anyways...
        data = data.toString();
        try {
            this.hitchStreamProcessor.write(data);
            this.detectMissingResource.write(data);
            globals.webConsole.buffer(data, markType);
            if(!globals.fxRunner.quiet) process.stdout.write(data.replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F\x80-\x9F\u2122]/g, ""));
        } catch (error) {
            if(globals.config.verbose) logError(`Buffer write error: ${error.message}`, context)
        }

        //Adding data to the buffers
        if(this.enableCmdBuffer) this.cmdBuffer += data;
        this.fileBuffer += data;
        this.webConsoleBuffer += data;
        if(this.webConsoleBuffer.length > 16*1024){
            //TODO: use xxx.indexOf("\n")
            this.webConsoleBuffer = this.webConsoleBuffer.slice(-8*1024);
        }
    }


    //================================================================
    /**
     * Print fxChild's stderr to the webconsole and to the terminal
     * @param {string} data
     */
    writeError(data) {
        //FIXME: this should be saving to a file, and should be persistent to the web console
        data = data.toString();
        try {
            globals.webConsole.buffer(data, 'error');
            if(!globals.fxRunner.quiet) process.stdout.write(chalk.red(data.replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F\x80-\x9F\u2122]/g, "")));
        } catch (error) {
            if(globals.config.verbose) logError(`Buffer write error: ${error.message}`, context)
        }
    }


    //================================================================
    /**
     * Save the log file and clear buffer
     */
    writeHeader() {
        let sep = '='.repeat(64);
        let timestamp = new Date().toLocaleString();
        let header = `\r\n${sep}\r\n======== FXServer starting - ${timestamp}\r\n${sep}\r\n`;
        this.write(header, 'info');
    }


    //================================================================
    /**
     * Save the log file and clear buffer
     */
    saveLog() {
        if(!this.fileBuffer.length) return;
        fs.appendFile(this.logPath, this.fileBuffer, {encoding: 'utf8'}, (err)=>{
            if(err){
                if(globals.config.verbose) logError(`File Write Buffer error: ${error.message}`, context)
            }else{
                this.fileBuffer = '';
            }
        });
        fs.stat(this.logPath, (err, stats)=>{
            if(err){
                if(globals.config.verbose) logError(`Log File get stats error: ${error.message}`, context)
            }else{
                this.logFileSize = prettyBytes(stats.size);
            }
        });
    }

} //Fim ConsoleBuffer()

/*
 * Copyright (c) 2013 Peter Flynn.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var _                   = brackets.getModule("thirdparty/lodash"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        Menus               = brackets.getModule("command/Menus"),
        Dialogs             = brackets.getModule("widgets/Dialogs"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        TokenUtils          = brackets.getModule("utils/TokenUtils");
    
    
    /**
     * Returns the given range of code as static HTML text with the appropriate color-coding CSS classes
     * @param {Editor} editor
     * @param {{line:number, ch:number}} start
     * @param {{line:number, ch:number}} end
     * @return {string}
     */
    function getHighlightedText(editor, start, end) {
        var pos = { line: start.line, ch: 0 };
        var it = TokenUtils.getInitialContext(editor._codeMirror, pos);
        var lastLine = start.line;
        
        var html = "";
        var lineHasText;
        
        function startLine() {
            html += "<div>";
            lineHasText = false;
        }
        function closeLine() {
            if (!lineHasText) {
                html += "&#8203;";  // zero-width space char to prop open line height
                // TODO: could use line-height or min-height (set == to line-height) here instead?
            }
            html += "</div>";
        }
        
        startLine();
        
        while (TokenUtils.moveNextToken(it) && it.pos.line <= end.line) {
            if (it.pos.line !== lastLine) {
                lastLine = it.pos.line;
                closeLine();
                startLine();
            }
            
            var lineText = _.escape(it.token.string);
            lineText = lineText.replace(/ {2}/g, "&nbsp; ");  // PowerPoint collapses all ws runs > len 2 otherwise
            
            if (it.token.type) {
                html += "<span class='cm-" + it.token.type + "'>" +
                        lineText + "</span>";
                lineHasText = true;
            } else {
                html += lineText;
                lineHasText = lineHasText || (it.token.string !== "");
            }
        }
        closeLine();
        
        return html;
    }
    
    
    function findThemeClass(editorDOMRoot) {
        var classes = editorDOMRoot.className.split(" ");
        var i;
        for (i = 0; i < classes.length; i++) {
            if (classes[i].indexOf("cm-s-") === 0) {
                return classes[i];
            }
        }
        
        console.error("Error: No theme classname found on editor", editorDOMRoot);
        return "";
    }
    
    
    /** Opens a dialog containing the HTML-formatted text, ready for copying */
    function showDialog() {
        var editor = EditorManager.getActiveEditor();
        var range;
        if (editor.hasSelection()) {
            range = editor.getSelection();
        } else {
            range = {start: {line: editor.getFirstVisibleLine(), ch: 0},
                     end: {line: editor.getLastVisibleLine() + 1, ch: 0}};
        }
        
        var html = getHighlightedText(editor, range.start, range.end);
        
        // Wrap in divs that stand in for '#editor-holder' & '.CodeMirror' since some theme selectors reference them
        html = "Copy this text to the clipboard: " +
            "<div id='editor-holder'><div class='copyHtml-cmStandIn' style='cursor: auto; -webkit-user-select: text; line-height: 1.25; overflow-x: auto; word-wrap: normal; white-space: pre; max-height: 500px; max-width: 800px; margin-top: 7px'>" +
            html + "</div></div>";
        
        Dialogs.showModalDialog(Dialogs.DIALOG_ID_ERROR, "HTML Ready to Copy", "")
            .done(function () { EditorManager.focusEditor(); });
        
        var $dialog = $(".modal.instance");
        $(".dialog-message", $dialog).html(html);
        
        // Copy theme class from editor's .CodeMirror div to our standin div
        var $cmStandin = $(".copyHtml-cmStandIn", $dialog);
        $cmStandin.addClass(findThemeClass(editor.getRootElement()));
        
        // Some theme CSS hangs off of .CodeMirror, but that brings with it a bunch of undesirable styles too, so rather than place
        // a fake '.CodeMirror' div here, we 'manually' copy over the important theme attributes to a standin div
        var $cmSample = $(".CodeMirror-scroll");
        var bgColor = $cmSample.css("background-color"),
            fgColor = $cmSample.css("color"),
            fonts = $cmSample.css("font-family"),
            fontSize = $cmSample.css("font-size");
        if (fonts.indexOf("SourceCodePro") === 0) {
            fonts = "SourceCodePro, Consolas, \"Lucida Console\", \"Courier New\"";  // ensure fallback fonts since other apps won't know what "SourceCodePro" is
        }
        $cmStandin.css({
            backgroundColor: bgColor,
            color: fgColor,
            fontFamily: fonts,
            fontSize: fontSize
        });
        
        if (brackets.platform === "win") {
            $(".dialog-message").css("font-weight", "normal");  // work around #4391, thanks Chrome!
        }
        
        // Bootstrap makes unhelpful assumptions about dialog height
        $(".modal-body", $dialog).css("max-height", "none");
        
        // Pre-select the text so it's easy to copy
        // (Due to browser security restrictions, we can't programmatically modify the clipboard ourelves - user still has to
        // press Ctrl+C at this point)
        window.getSelection().selectAllChildren($(".dialog-message > div", $dialog)[0]);
    }
    
    
    // Expose in UI
    var CMD_COPY_HTML = "pflynn.copy-as-html";
    CommandManager.register("Copy as Colored HTML", CMD_COPY_HTML, showDialog);
    
    var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
    menu.addMenuItem(CMD_COPY_HTML, null, Menus.AFTER, Commands.EDIT_COPY);
});
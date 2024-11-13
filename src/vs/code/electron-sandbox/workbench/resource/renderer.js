/*
//创建主菜单表格
const ribbon = document.createElement('div');
ribbon.id = 'jqxribbon';
ribbon.classList = 'jqxRibbon';
const parent = document.getElementById('my-menu');
parent.appendChild(ribbon);

//表格标题
const jqxribbonTable = document.createElement('ul');
jqxribbonTable.id = 'jqxribbonTable';
ribbon.appendChild(jqxribbonTable);
const jqxribbonTableHome = document.createElement('li');
jqxribbonTableHome.id = 'jqxribbonTableHome';
jqxribbonTableHome.textContent = '主页';
const jqxribbonTablePaint = document.createElement('li');
jqxribbonTablePaint.id = 'jqxribbonTablePaint';
jqxribbonTablePaint.textContent = '绘图';
const jqxribbonTableAPP = document.createElement('li');
jqxribbonTableAPP.id = 'jqxribbonTableAPP';
jqxribbonTableAPP.textContent = 'APP';
const jqxribbonTableView = document.createElement('li');
jqxribbonTableView.id = 'jqxribbonTableView';
jqxribbonTableView.textContent = '视图';
const jqxribbonTableHelp = document.createElement('li');
jqxribbonTableHelp.id = 'jqxribbonTableHelp';
jqxribbonTableHelp.textContent = '帮助';
jqxribbonTable.appendChild(jqxribbonTableHome);
jqxribbonTable.appendChild(jqxribbonTablePaint);
jqxribbonTable.appendChild(jqxribbonTableAPP);
jqxribbonTable.appendChild(jqxribbonTableView);
jqxribbonTable.appendChild(jqxribbonTableHelp);


//表格页面容器
const jqxContent = document.createElement('div');
ribbon.appendChild(jqxContent);

//主页
const homePageP = document.createElement('div');
const homePage = document.createElement('div');
homePage.id = 'homePage';

//主页-文件
const homePageFile = document.createElement('div');
homePageFile.classList = 'sub-homePage';

const homePageFileContent = document.createElement('div');
homePageFileContent.classList = 'button-container';
const addNew = document.createElement('a');
const openFile = document.createElement('a');
const save = document.createElement('a');

addNew.classList = 'jqxButton';
addNew.id = 'addNew';
addNew.textContent = '新建';

openFile.classList = 'jqxButton';
openFile.textContent = '打开';
save.classList = 'jqxButton';
save.textContent = '保存';

homePageFileContent.appendChild(addNew);
homePageFileContent.appendChild(openFile);
homePageFileContent.appendChild(save);

const homePageFileText = document.createElement('div');
homePageFileText.textContent = '文件';
homePageFileText.classList = 'bottom-text';
homePageFile.appendChild(homePageFileContent)
homePageFile.appendChild(homePageFileText)
homePage.appendChild(homePageFile);


//主页-变量
const homePageVariable = document.createElement('div');
homePageVariable.classList = 'sub-homePage';
const importData = document.createElement('a');
importData.classList = 'jqxButton';
importData.textContent = '导入';
homePageVariable.appendChild(importData);
const exportData = document.createElement('a');
exportData.classList = 'jqxButton';
exportData.textContent = '导出';
homePageVariable.appendChild(exportData);
homePage.appendChild(homePageVariable);


//主页-运行
const homePageRun = document.createElement('div');
homePageRun.classList = 'sub-homePage';
const runProgram = document.createElement('a');
runProgram.classList = 'jqxButton';
runProgram.textContent = '运行';
homePageRun.appendChild(runProgram);
homePage.appendChild(homePageRun);


//主页-调试
const homePageDebug = document.createElement('div');
homePageDebug.classList = 'sub-homePage';
const debug = document.createElement('a');
debug.classList = 'jqxButton';
debug.textContent = '启动调试';
homePageDebug.appendChild(debug);
homePage.appendChild(homePageDebug);
homePageP.appendChild(homePage)


//绘画页
const paintPageP = document.createElement('div');
const paintPage = document.createElement('div');
paintPage.id = 'paintPage';
paintPageP.appendChild(paintPage)


//app页
const appPageP = document.createElement('div');
const appPage = document.createElement('div');
appPage.id = 'appPage';
appPageP.appendChild(appPage)


//视图页
const viewPageP = document.createElement('div');
const viewPage = document.createElement('div');
viewPage.id = 'viewPage';
viewPageP.appendChild(viewPage)


//帮助页
const helpPageP = document.createElement('div');
const helpPage = document.createElement('div');
helpPage.id = 'helpPage';
helpPageP.appendChild(helpPage)

//将页面添加到表格页面容器
jqxContent.appendChild(homePageP);
jqxContent.appendChild(paintPageP);
jqxContent.appendChild(appPageP);
jqxContent.appendChild(viewPageP);
jqxContent.appendChild(helpPageP);
*/

//控件
$(document).ready(function () {
	// Create a jqxLinkButton widget.
	$(".sub-homePage-0 .jqxButton").jqxLinkButton({ width: '65', height: '25' });
	$(".sub-homePage-1 .jqxButton").jqxLinkButton({ width: '80', height: '25' });
	$(".sub-homePage-2 .jqxButton").jqxLinkButton({ width: '50', height: '35' });
	$(".sub-homePage-3 .jqxButton").jqxLinkButton({ width: '70', height: '25' });
	$("#viewPage .jqxButton").jqxLinkButton({ width: '70', height: '25' });
	$(".jqxRibbon").jqxRibbon({ width: '100%', height: 125, position: "top", selectionMode: "click", animationType: "fade" });
});






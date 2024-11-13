/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/titlebarpart';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { localize, localize2 } from 'vs/nls';
import { MultiWindowParts, Part } from 'vs/workbench/browser/part';
import { ITitleService } from 'vs/workbench/services/title/browser/titleService';
import { getWCOBoundingRect, getZoomFactor, isWCOEnabled } from 'vs/base/browser/browser';
import { MenuBarVisibility, getTitleBarStyle, getMenuBarVisibility, TitlebarStyle, hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT } from 'vs/platform/window/common/window';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER, WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { isMacintosh, isWindows, isLinux, isWeb, isNative, platformLocale } from 'vs/base/common/platform';
import { Color } from 'vs/base/common/color';
import { EventType, EventHelper, Dimension, append, $, addDisposableListener, prepend, reset, getWindow, getWindowId, isAncestor, getActiveDocument, isHTMLElement } from 'vs/base/browser/dom';
import { CustomMenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { Parts, IWorkbenchLayoutService, ActivityBarPosition, LayoutSettings, EditorActionsLocation, EditorTabsMode } from 'vs/workbench/services/layout/browser/layoutService';
import { createActionViewItem, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Action2, IMenu, IMenuService, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { Codicon } from 'vs/base/common/codicons';
import { getIconRegistry } from 'vs/platform/theme/common/iconRegistry';
import { WindowTitle } from 'vs/workbench/browser/parts/titlebar/windowTitle';
import { CommandCenterControl } from 'vs/workbench/browser/parts/titlebar/commandCenterControl';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from 'vs/workbench/common/activity';
import { AccountsActivityActionViewItem, isAccountsActionVisible, SimpleAccountActivityActionViewItem, SimpleGlobalActivityActionViewItem } from 'vs/workbench/browser/parts/globalCompositeBar';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { IEditorGroupsContainer, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ActionsOrientation, IActionViewItem, prepareActions } from 'vs/base/browser/ui/actionbar/actionbar';
import { EDITOR_CORE_NAVIGATION_COMMANDS } from 'vs/workbench/browser/parts/editor/editorCommands';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { EditorCommandsContextActionRunner } from 'vs/workbench/browser/parts/editor/editorTabsControl';
import { IEditorCommandsContext, IEditorPartOptionsChangeEvent, IToolbarActions } from 'vs/workbench/common/editor';
import { CodeWindow, mainWindow } from 'vs/base/browser/window';
import { ACCOUNTS_ACTIVITY_TILE_ACTION, GLOBAL_ACTIVITY_TITLE_ACTION } from 'vs/workbench/browser/parts/titlebar/titlebarActions';
import { IView } from 'vs/base/browser/ui/grid/grid';
import { createInstantHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IBaseActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { app, BrowserWindow } from 'electron';
export interface ITitleVariable {
	readonly name: string;
	readonly contextKey: string;
}

export interface ITitleProperties {
	isPure?: boolean;
	isAdmin?: boolean;
	prefix?: string;
}

export interface ITitlebarPart extends IDisposable {

	/**
	 * An event when the menubar visibility changes.
	 */
	readonly onMenubarVisibilityChange: Event<boolean>;

	/**
	 * Update some environmental title properties.
	 */
	updateProperties(properties: ITitleProperties): void;

	/**
	 * Adds variables to be supported in the window title.
	 */
	registerVariables(variables: ITitleVariable[]): void;
}

export class BrowserTitleService extends MultiWindowParts<BrowserTitlebarPart> implements ITitleService {

	declare _serviceBrand: undefined;

	readonly mainPart = this._register(this.createMainTitlebarPart());

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService
	) {
		super('workbench.titleService', themeService, storageService);

		this._register(this.registerPart(this.mainPart));

		this.registerActions();

	}

	protected createMainTitlebarPart(): BrowserTitlebarPart {
		return this.instantiationService.createInstance(MainBrowserTitlebarPart);
	}

	private registerActions(): void {

		// Focus action
		const that = this;
		this._register(registerAction2(class FocusTitleBar extends Action2 {

			constructor() {
				super({
					id: `workbench.action.focusTitleBar`,
					title: localize2('focusTitleBar', 'Focus Title Bar'),
					category: Categories.View,
					f1: true,
				});
			}

			run(): void {
				that.getPartByDocument(getActiveDocument()).focus();
			}
		}));
	}

	//#region Auxiliary Titlebar Parts

	createAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer): IAuxiliaryTitlebarPart {
		const titlebarPartContainer = document.createElement('div');
		titlebarPartContainer.classList.add('part', 'titlebar');
		titlebarPartContainer.setAttribute('role', 'none');
		titlebarPartContainer.style.position = 'relative';
		container.insertBefore(titlebarPartContainer, container.firstChild); // ensure we are first element

		const disposables = new DisposableStore();

		const titlebarPart = this.doCreateAuxiliaryTitlebarPart(titlebarPartContainer, editorGroupsContainer);
		disposables.add(this.registerPart(titlebarPart));

		disposables.add(Event.runAndSubscribe(titlebarPart.onDidChange, () => titlebarPartContainer.style.height = `${titlebarPart.height}px`));
		titlebarPart.create(titlebarPartContainer);

		if (this.properties) {
			titlebarPart.updateProperties(this.properties);
		}

		if (this.variables.length) {
			titlebarPart.registerVariables(this.variables);
		}

		Event.once(titlebarPart.onWillDispose)(() => disposables.dispose());

		return titlebarPart;
	}

	protected doCreateAuxiliaryTitlebarPart(container: HTMLElement, editorGroupsContainer: IEditorGroupsContainer): BrowserTitlebarPart & IAuxiliaryTitlebarPart {
		return this.instantiationService.createInstance(AuxiliaryBrowserTitlebarPart, container, editorGroupsContainer, this.mainPart);
	}

	//#endregion


	//#region Service Implementation

	readonly onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;

	private properties: ITitleProperties | undefined = undefined;

	updateProperties(properties: ITitleProperties): void {
		this.properties = properties;

		for (const part of this.parts) {
			part.updateProperties(properties);
		}
	}

	private variables: ITitleVariable[] = [];

	registerVariables(variables: ITitleVariable[]): void {
		this.variables.push(...variables);

		for (const part of this.parts) {
			part.registerVariables(variables);
		}
	}

	//#endregion
}

export class BrowserTitlebarPart extends Part implements ITitlebarPart {

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;

	get minimumHeight(): number {
		//const wcoEnabled = isWeb && isWCOEnabled();
		//let value = this.isCommandCenterVisible || wcoEnabled ? DEFAULT_CUSTOM_TITLEBAR_HEIGHT : 30;
		//if (wcoEnabled) {
		//	value = Math.max(value, getWCOBoundingRect()?.height ?? 0);
		//}

		//return value / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
		return 180;//114514
	}

	get maximumHeight(): number { return this.minimumHeight; }

	//#endregion

	//#region Events

	private _onMenubarVisibilityChange = this._register(new Emitter<boolean>());
	readonly onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	//#endregion
	private winn: BrowserWindow | undefined;
	protected myContainer: HTMLElement | undefined;
	protected ribbon: HTMLElement | undefined;
	protected jqxribbonTable: HTMLElement | undefined;
	protected jqxribbonTableHome: HTMLElement | undefined;
	protected jqxribbonTablePaint: HTMLElement | undefined;
	protected jqxribbonTableAPP: HTMLElement | undefined;
	protected jqxribbonTableView: HTMLElement | undefined;
	protected jqxribbonTableHelp: HTMLElement | undefined;
	protected jqxContent: HTMLElement | undefined;

	protected homePageP: HTMLElement | undefined;
	protected homePage: HTMLElement | undefined;


	protected homePageFile: HTMLElement | undefined;
	protected homePageFileContent: HTMLElement | undefined;
	protected addNew: HTMLElement | undefined;
	protected openFile: HTMLElement | undefined;
	protected save: HTMLElement | undefined;
	protected saveAs: HTMLElement | undefined;
	protected saveAll: HTMLElement | undefined;
	protected homePageFileText: HTMLElement | undefined;


	protected homePageVariable: HTMLElement | undefined;
	protected homePageVariableContent: HTMLElement | undefined;
	protected addCommentLine: HTMLElement | undefined;
	protected removeCommentLine: HTMLElement | undefined;
	protected blockComment: HTMLElement | undefined;
	protected formatDocument: HTMLElement | undefined;
	protected formatSelection: HTMLElement | undefined;
	protected fold: HTMLElement | undefined;
	protected unfold: HTMLElement | undefined;
	protected find: HTMLElement | undefined;
	protected replace: HTMLElement | undefined;
	protected homePageVariableText: HTMLElement | undefined;

	protected homePageRun: HTMLElement | undefined;
	protected homePageRunContent: HTMLElement | undefined;
	protected runProgram: HTMLElement | undefined;
	protected homePageRunText: HTMLElement | undefined;

	protected homePageDebug: HTMLElement | undefined;
	protected homePageDebugContent: HTMLElement | undefined;
	protected debugStart: HTMLElement | undefined;
	protected debugStop: HTMLElement | undefined;
	protected debugContinue: HTMLElement | undefined;
	protected stepOver: HTMLElement | undefined;
	protected stepInto: HTMLElement | undefined;
	protected stepOut: HTMLElement | undefined;
	protected debugRestart: HTMLElement | undefined;
	protected homePageDebugText: HTMLElement | undefined;



	//protected a: HTMLElement | undefined;
	protected appPageP: HTMLElement | undefined;
	protected appPage: HTMLElement | undefined;




	protected viewPageP: HTMLElement | undefined;
	protected viewPage: HTMLElement | undefined;

	protected viewPageLayout: HTMLElement | undefined;
	protected viewPageLayoutContent: HTMLElement | undefined;
	protected toggleZenMode: HTMLElement | undefined;
	protected toggleFullScreen: HTMLElement | undefined;
	protected zoomIn: HTMLElement | undefined;
	protected zoomOut: HTMLElement | undefined;
	protected zoomReset: HTMLElement | undefined;
	protected splitEditor: HTMLElement | undefined;
	protected viewPageLayoutText: HTMLElement | undefined;


	protected viewPageDisplay: HTMLElement | undefined;
	protected viewPageDisplayContent: HTMLElement | undefined;
	protected toggleSidebarVisibility: HTMLElement | undefined;
	protected toggleActivityBarVisibility: HTMLElement | undefined;
	protected toggleStatusbarVisibility: HTMLElement | undefined;
	protected togglePanel: HTMLElement | undefined;
	protected toggleEditorGroupLayout: HTMLElement | undefined;
	protected viewPageDisplayText: HTMLElement | undefined;


	protected myJS: HTMLScriptElement | undefined;
	private readonly myListener1 = this._register(new MutableDisposable());
	private readonly myListener2 = this._register(new MutableDisposable());
	private readonly myListener3 = this._register(new MutableDisposable());
	private readonly myListener4 = this._register(new MutableDisposable());
	private readonly myListener5 = this._register(new MutableDisposable());
	private readonly myListener6 = this._register(new MutableDisposable());
	private readonly myListener7 = this._register(new MutableDisposable());
	private readonly myListener8 = this._register(new MutableDisposable());
	private readonly myListener9 = this._register(new MutableDisposable());
	private readonly myListener10 = this._register(new MutableDisposable());
	private readonly myListener11 = this._register(new MutableDisposable());
	private readonly myListener12 = this._register(new MutableDisposable());
	private readonly myListener13 = this._register(new MutableDisposable());
	private readonly myListener14 = this._register(new MutableDisposable());
	private readonly myListener15 = this._register(new MutableDisposable());
	private readonly myListener16 = this._register(new MutableDisposable());
	private readonly myListener17 = this._register(new MutableDisposable());
	private readonly myListener18 = this._register(new MutableDisposable());
	private readonly myListener19 = this._register(new MutableDisposable());
	private readonly myListener20 = this._register(new MutableDisposable());
	private readonly myListener21 = this._register(new MutableDisposable());
	private readonly myListener22 = this._register(new MutableDisposable());
	private readonly myListener23 = this._register(new MutableDisposable());
	private readonly myListener24 = this._register(new MutableDisposable());
	private readonly myListener25 = this._register(new MutableDisposable());
	private readonly myListener26 = this._register(new MutableDisposable());
	private readonly myListener27 = this._register(new MutableDisposable());
	private readonly myListener28 = this._register(new MutableDisposable());
	private readonly myListener29 = this._register(new MutableDisposable());
	private readonly myListener30 = this._register(new MutableDisposable());
	private readonly myListener31 = this._register(new MutableDisposable());
	private readonly myListener32 = this._register(new MutableDisposable());
	private readonly myListener33 = this._register(new MutableDisposable());



	protected rootContainer!: HTMLElement;
	protected primaryWindowControls: HTMLElement | undefined;
	protected dragRegion: HTMLElement | undefined;
	private title!: HTMLElement;

	private leftContent!: HTMLElement;
	private centerContent!: HTMLElement;
	private rightContent!: HTMLElement;

	protected customMenubar: CustomMenubarControl | undefined;
	protected appIcon: HTMLElement | undefined;
	private appIconBadge: HTMLElement | undefined;
	protected menubar?: HTMLElement;
	private lastLayoutDimensions: Dimension | undefined;

	private actionToolBar!: WorkbenchToolBar;
	private readonly actionToolBarDisposable = this._register(new DisposableStore());
	private readonly editorActionsChangeDisposable = this._register(new DisposableStore());
	private actionToolBarElement!: HTMLElement;

	private layoutToolbarMenu: IMenu | undefined;
	private readonly editorToolbarMenuDisposables = this._register(new DisposableStore());
	private readonly layoutToolbarMenuDisposables = this._register(new DisposableStore());
	private readonly activityToolbarDisposables = this._register(new DisposableStore());

	private readonly hoverDelegate: IHoverDelegate;

	private readonly titleDisposables = this._register(new DisposableStore());
	private titleBarStyle: TitlebarStyle = getTitleBarStyle(this.configurationService);

	private isInactive: boolean = false;
	private readonly isAuxiliary: boolean;

	private readonly windowTitle: WindowTitle;

	private readonly editorService: IEditorService;
	private readonly editorGroupsContainer: IEditorGroupsContainer;

	constructor(
		id: string,
		targetWindow: CodeWindow,
		editorGroupsContainer: IEditorGroupsContainer | 'main',
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IBrowserWorkbenchEnvironmentService protected readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(id, { hasTitle: false }, themeService, storageService, layoutService);

		this.isAuxiliary = editorGroupsContainer !== 'main';
		this.editorService = editorService.createScoped(editorGroupsContainer, this._store);
		this.editorGroupsContainer = editorGroupsContainer === 'main' ? editorGroupService.mainPart : editorGroupsContainer;

		this.windowTitle = this._register(instantiationService.createInstance(WindowTitle, targetWindow, editorGroupsContainer));

		this.hoverDelegate = this._register(createInstantHoverDelegate());

		this.registerListeners(getWindowId(targetWindow));
	}

	private registerListeners(targetWindowId: number): void {
		this._register(this.hostService.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBlur()));
		this._register(this.hostService.onDidChangeActiveWindow(windowId => windowId === targetWindowId ? this.onFocus() : this.onBlur()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
		this._register(this.editorGroupService.onDidChangeEditorPartOptions(e => this.onEditorPartConfigurationChange(e)));
	}

	private onBlur(): void {
		this.isInactive = true;

		this.updateStyles();
	}

	private onFocus(): void {
		this.isInactive = false;

		this.updateStyles();
	}

	private onEditorPartConfigurationChange({ oldPartOptions, newPartOptions }: IEditorPartOptionsChangeEvent): void {
		if (
			oldPartOptions.editorActionsLocation !== newPartOptions.editorActionsLocation ||
			oldPartOptions.showTabs !== newPartOptions.showTabs
		) {
			if (hasCustomTitlebar(this.configurationService, this.titleBarStyle) && this.actionToolBar) {
				this.createActionToolBar();
				this.createActionToolBarMenus({ editorActions: true });
				this._onDidChange.fire(undefined);
			}
		}
	}

	protected onConfigurationChanged(event: IConfigurationChangeEvent): void {

		// Custom menu bar (disabled if auxiliary)
		if (!this.isAuxiliary && !hasNativeTitlebar(this.configurationService, this.titleBarStyle) && (!isMacintosh || isWeb)) {
			if (event.affectsConfiguration('window.menuBarVisibility')) {
				if (this.currentMenubarVisibility === 'compact') {
					this.uninstallMenubar();
				} else {
					this.installMenubar();
				}
			}
		}

		// Actions
		if (hasCustomTitlebar(this.configurationService, this.titleBarStyle) && this.actionToolBar) {
			const affectsLayoutControl = event.affectsConfiguration(LayoutSettings.LAYOUT_ACTIONS);
			const affectsActivityControl = event.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION);

			if (affectsLayoutControl || affectsActivityControl) {
				this.createActionToolBarMenus({ layoutActions: affectsLayoutControl, activityActions: affectsActivityControl });

				this._onDidChange.fire(undefined);
			}
		}

		// Command Center
		if (event.affectsConfiguration(LayoutSettings.COMMAND_CENTER)) {
			this.createTitle();

			this._onDidChange.fire(undefined);
		}
	}

	protected installMenubar(): void {
		if (this.menubar) {
			return; // If the menubar is already installed, skip
		}

		this.customMenubar = this._register(this.instantiationService.createInstance(CustomMenubarControl));

		this.menubar = append(this.leftContent, $('div.menubar'));
		this.menubar.setAttribute('role', 'menubar');

		this._register(this.customMenubar.onVisibilityChange(e => this.onMenubarVisibilityChanged(e)));

		this.customMenubar.create(this.menubar);
	}

	private uninstallMenubar(): void {
		this.customMenubar?.dispose();
		this.customMenubar = undefined;

		this.menubar?.remove();
		this.menubar = undefined;

		this.onMenubarVisibilityChanged(false);
	}

	protected onMenubarVisibilityChanged(visible: boolean): void {
		if (isWeb || isWindows || isLinux) {
			if (this.lastLayoutDimensions) {
				this.layout(this.lastLayoutDimensions.width, this.lastLayoutDimensions.height);
			}

			this._onMenubarVisibilityChange.fire(visible);
		}
	}

	updateProperties(properties: ITitleProperties): void {
		this.windowTitle.updateProperties(properties);
	}

	registerVariables(variables: ITitleVariable[]): void {
		this.windowTitle.registerVariables(variables);
	}/*
	private mine1(): void {
		this.winn = new BrowserWindow({
			width: 800,
			height: 600,
		});
		this.winn.show();
	}*/
	private mine(): void {
		const opts: RequestInit = {
			method: 'POST',
			body: JSON.stringify({ message: 'Hello from Electron main process' }),
			headers: {
				'Content-Type': 'application/json'
			}
		};
		fetch('http://10.196.183.16:9000/prepare_data', opts)
			.then(response => response.json())
			.then(data => console.log(data));
		//this.mine1();
	}
	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;
		this.rootContainer = append(parent, $('.titlebar-container'));

		this.myContainer = document.createElement('div');
		this.myContainer.id = ('my-menu');
		this.element.appendChild(this.myContainer);

		// 创建主菜单表格
		this.ribbon = document.createElement('div');
		this.ribbon.id = 'jqxribbon';
		this.ribbon.classList.add('jqxRibbon');
		this.myContainer.appendChild(this.ribbon); // 使用 optional chaining 来确保 parent 不为 null

		// 表格标题
		this.jqxribbonTable = document.createElement('ul');
		this.jqxribbonTable.id = 'jqxribbonTable';
		this.ribbon.appendChild(this.jqxribbonTable);

		this.jqxribbonTableHome = document.createElement('li');
		this.jqxribbonTableHome.id = 'jqxribbonTableHome';
		this.jqxribbonTableHome.textContent = '主页';

		this.jqxribbonTableAPP = document.createElement('li');
		this.jqxribbonTableAPP.id = 'jqxribbonTableAPP';
		this.jqxribbonTableAPP.textContent = 'APP';

		this.jqxribbonTableView = document.createElement('li');
		this.jqxribbonTableView.id = 'jqxribbonTableView';
		this.jqxribbonTableView.textContent = '视图';


		this.jqxribbonTable.appendChild(this.jqxribbonTableHome);
		this.jqxribbonTable.appendChild(this.jqxribbonTableAPP);
		this.jqxribbonTable.appendChild(this.jqxribbonTableView);

		// 表格页面容器
		this.jqxContent = document.createElement('div');
		this.ribbon.appendChild(this.jqxContent);

		// 主页
		this.homePageP = document.createElement('div');
		this.homePage = document.createElement('div');
		this.homePage.id = 'homePage';

		// 主页-文件
		this.homePageFile = document.createElement('div');
		this.homePageFile.classList.add('sub-homePage');
		this.homePageFile.classList.add('sub-homePage-0');


		this.homePageFileContent = document.createElement('div');
		this.homePageFileContent.classList.add('button-container');

		this.addNew = document.createElement('a');
		this.addNew.classList.add('jqxButton');
		this.addNew.textContent = '新建';
		this.addNew.id = 'addNew';
		this.homePageFileContent.appendChild(this.addNew);
		this.myListener1.value = addDisposableListener(this.addNew, EventType.CLICK, async () => {
			//this.commandService.executeCommand('workbench.action.files.newFile');
			this.mine();
		});

		this.openFile = document.createElement('a');
		this.openFile.classList.add('jqxButton');
		this.openFile.textContent = '打开';
		this.openFile.id = 'openFile';
		this.homePageFileContent.appendChild(this.openFile);
		this.myListener2.value = addDisposableListener(this.openFile, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.files.openFile') });

		this.save = document.createElement('a');
		this.save.classList.add('jqxButton');
		this.save.textContent = '保存';
		this.save.id = 'save';
		this.homePageFileContent.appendChild(this.save);
		this.myListener3.value = addDisposableListener(this.save, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.files.save') });

		this.saveAs = document.createElement('a');
		this.saveAs.classList.add('jqxButton');
		this.saveAs.textContent = '另存为';
		this.saveAs.id = 'saveAs';
		this.homePageFileContent.appendChild(this.saveAs);
		this.myListener4.value = addDisposableListener(this.saveAs, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.files.saveAs') });

		this.saveAll = document.createElement('a');
		this.saveAll.classList.add('jqxButton');
		this.saveAll.textContent = '保存全部';
		this.saveAll.id = 'saveAll';
		this.homePageFileContent.appendChild(this.saveAll);
		this.myListener5.value = addDisposableListener(this.saveAll, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.files.saveAll') });


		this.homePageFile.appendChild(this.homePageFileContent);


		this.homePageFileText = document.createElement('div');
		this.homePageFileText.textContent = '文件';
		this.homePageFileText.classList.add('bottom-text');
		this.homePageFile.appendChild(this.homePageFileText);

		this.homePage.appendChild(this.homePageFile);

		// 主页-编辑
		this.homePageVariable = document.createElement('div');
		this.homePageVariable.classList.add('sub-homePage');
		this.homePageVariable.classList.add('sub-homePage-1');

		this.homePageVariableContent = document.createElement('div');
		this.homePageVariableContent.classList.add('button-container');

		this.addCommentLine = document.createElement('a');
		this.addCommentLine.classList.add('jqxButton');
		this.addCommentLine.textContent = '添加注释行';
		this.addCommentLine.id = 'addCommentLine';
		this.homePageVariableContent.appendChild(this.addCommentLine);
		this.myListener6.value = addDisposableListener(this.addCommentLine, EventType.CLICK, () => { this.commandService.executeCommand('editor.action.addCommentLine') });


		this.removeCommentLine = document.createElement('a');
		this.removeCommentLine.classList.add('jqxButton');
		this.removeCommentLine.textContent = '移除注释行';
		this.removeCommentLine.id = 'removeCommentLine';
		this.homePageVariableContent.appendChild(this.removeCommentLine);
		this.myListener7.value = addDisposableListener(this.removeCommentLine, EventType.CLICK, () => { this.commandService.executeCommand('editor.action.removeCommentLine') });


		this.blockComment = document.createElement('a');
		this.blockComment.classList.add('jqxButton');
		this.blockComment.textContent = '块注释';
		this.blockComment.id = 'blockComment';
		this.homePageVariableContent.appendChild(this.blockComment);
		this.myListener8.value = addDisposableListener(this.blockComment, EventType.CLICK, () => { this.commandService.executeCommand('editor.action.blockComment') });

		this.formatDocument = document.createElement('a');
		this.formatDocument.classList.add('jqxButton');
		this.formatDocument.textContent = '格式化文档';
		this.formatDocument.id = 'formatDocument';
		this.homePageVariableContent.appendChild(this.formatDocument);
		this.myListener9.value = addDisposableListener(this.formatDocument, EventType.CLICK, () => { this.commandService.executeCommand('editor.action.formatDocument') });


		this.formatSelection = document.createElement('a');
		this.formatSelection.classList.add('jqxButton');
		this.formatSelection.textContent = '格式化选中部分';
		this.formatSelection.id = 'formatSelection';
		this.homePageVariableContent.appendChild(this.formatSelection);
		this.myListener10.value = addDisposableListener(this.formatSelection, EventType.CLICK, () => { this.commandService.executeCommand('editor.action.formatSelection') });

		this.fold = document.createElement('a');
		this.fold.classList.add('jqxButton');
		this.fold.textContent = '折叠代码';
		this.fold.id = 'fold';
		this.homePageVariableContent.appendChild(this.fold);
		this.myListener11.value = addDisposableListener(this.fold, EventType.CLICK, () => { this.commandService.executeCommand('editor.fold') });

		this.unfold = document.createElement('a');
		this.unfold.classList.add('jqxButton');
		this.unfold.textContent = '展开代码';
		this.unfold.id = 'unfold';
		this.homePageVariableContent.appendChild(this.unfold);
		this.myListener12.value = addDisposableListener(this.unfold, EventType.CLICK, () => { this.commandService.executeCommand('editor.unfold') });

		this.find = document.createElement('a');
		this.find.classList.add('jqxButton');
		this.find.textContent = '查找';
		this.find.id = 'find';
		this.homePageVariableContent.appendChild(this.find);
		this.myListener13.value = addDisposableListener(this.find, EventType.CLICK, () => { this.commandService.executeCommand('editor.action.find') });

		this.replace = document.createElement('a');
		this.replace.classList.add('jqxButton');
		this.replace.textContent = '替换';
		this.replace.id = 'replace';
		this.homePageVariableContent.appendChild(this.replace);
		this.myListener14.value = addDisposableListener(this.replace, EventType.CLICK, () => { this.commandService.executeCommand('editor.action.replace') });

		this.homePageVariable.appendChild(this.homePageVariableContent);

		this.homePageVariableText = document.createElement('div');
		this.homePageVariableText.textContent = '编辑';
		this.homePageVariableText.classList.add('bottom-text');
		this.homePageVariable.appendChild(this.homePageVariableText);

		this.homePage.appendChild(this.homePageVariable);

		// 主页-运行
		this.homePageRun = document.createElement('div');
		this.homePageRun.classList.add('sub-homePage');
		this.homePageRun.classList.add('sub-homePage-2');

		this.homePageRunContent = document.createElement('div');
		this.homePageRunContent.classList.add('button-container');

		this.runProgram = document.createElement('a');
		this.runProgram.classList.add('jqxButton');
		this.runProgram.textContent = '运行';
		this.runProgram.id = ('homePage-run')
		this.homePageRunContent.appendChild(this.runProgram);
		this.myListener15.value = addDisposableListener(this.runProgram, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.debug.run') });

		this.homePageRun.appendChild(this.homePageRunContent);

		this.homePageRunText = document.createElement('div');
		this.homePageRunText.textContent = '运行';
		this.homePageRunText.classList.add('bottom-text');
		this.homePageRun.appendChild(this.homePageRunText);

		this.homePage.appendChild(this.homePageRun);

		// 主页-调试
		this.homePageDebug = document.createElement('div');
		this.homePageDebug.classList.add('sub-homePage');
		this.homePageDebug.classList.add('sub-homePage-3');

		this.homePageDebugContent = document.createElement('div');
		this.homePageDebugContent.classList.add('button-container');

		this.debugStart = document.createElement('a');
		this.debugStart.classList.add('jqxButton');
		this.debugStart.textContent = '启动调试';
		this.debugStart.id = 'debugStart';
		this.homePageDebugContent.appendChild(this.debugStart);
		this.myListener16.value = addDisposableListener(this.debugStart, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.debug.start') });

		this.debugStop = document.createElement('a');
		this.debugStop.classList.add('jqxButton');
		this.debugStop.textContent = '停止调试';
		this.debugStop.id = 'debugStop';
		this.homePageDebugContent.appendChild(this.debugStop);
		this.myListener17.value = addDisposableListener(this.debugStop, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.debug.stop') });

		this.debugContinue = document.createElement('a');
		this.debugContinue.classList.add('jqxButton');
		this.debugContinue.textContent = '继续执行';
		this.debugContinue.id = 'debugContinue';
		this.homePageDebugContent.appendChild(this.debugContinue);
		this.myListener18.value = addDisposableListener(this.debugContinue, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.debug.continue') });

		this.stepOver = document.createElement('a');
		this.stepOver.classList.add('jqxButton');
		this.stepOver.textContent = '单步跳过';
		this.stepOver.id = 'stepOver';
		this.homePageDebugContent.appendChild(this.stepOver);
		this.myListener19.value = addDisposableListener(this.stepOver, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.debug.stepOver') });

		this.stepInto = document.createElement('a');
		this.stepInto.classList.add('jqxButton');
		this.stepInto.textContent = '单步进入';
		this.stepInto.id = 'stepInto';
		this.homePageDebugContent.appendChild(this.stepInto);
		this.myListener20.value = addDisposableListener(this.stepInto, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.debug.stepInto') });

		this.stepOut = document.createElement('a');
		this.stepOut.classList.add('jqxButton');
		this.stepOut.textContent = '单步退出';
		this.stepOut.id = 'stepOut';
		this.homePageDebugContent.appendChild(this.stepOut);
		this.myListener21.value = addDisposableListener(this.stepOut, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.debug.stepOut') });

		this.debugRestart = document.createElement('a');
		this.debugRestart.classList.add('jqxButton');
		this.debugRestart.textContent = '重启调试';
		this.debugRestart.id = 'debugRestart';
		this.homePageDebugContent.appendChild(this.debugRestart);
		this.myListener22.value = addDisposableListener(this.debugRestart, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.debug.restart') });

		this.homePageDebug.appendChild(this.homePageDebugContent);

		this.homePageDebugText = document.createElement('div');
		this.homePageDebugText.textContent = '运行';
		this.homePageDebugText.classList.add('bottom-text');
		this.homePageDebug.appendChild(this.homePageDebugText);


		this.homePage.appendChild(this.homePageDebug);


		this.homePageP.appendChild(this.homePage);


		// app页
		this.appPageP = document.createElement('div');
		this.appPage = document.createElement('div');
		this.appPage.id = 'appPage';



		this.appPageP.appendChild(this.appPage);

		// 视图页
		this.viewPageP = document.createElement('div');
		this.viewPage = document.createElement('div');
		this.viewPage.id = 'viewPage';

		//视图-布局
		this.viewPageLayout = document.createElement('div');
		this.viewPageLayout.classList.add('sub-homePage');

		this.viewPageLayoutContent = document.createElement('div');
		this.viewPageLayoutContent.classList.add('button-container');

		this.toggleZenMode = document.createElement('a');
		this.toggleZenMode.classList.add('jqxButton');
		this.toggleZenMode.textContent = '切换Zen模式';
		this.toggleZenMode.id = 'toggleZenMode';
		this.viewPageLayoutContent.appendChild(this.toggleZenMode);
		this.myListener23.value = addDisposableListener(this.toggleZenMode, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.toggleZenMode') });

		this.toggleFullScreen = document.createElement('a');
		this.toggleFullScreen.classList.add('jqxButton');
		this.toggleFullScreen.textContent = '切换全屏模式';
		this.toggleFullScreen.id = 'toggleFullScreen';
		this.viewPageLayoutContent.appendChild(this.toggleFullScreen);
		this.myListener24.value = addDisposableListener(this.toggleFullScreen, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.toggleFullScreen') });

		this.zoomIn = document.createElement('a');
		this.zoomIn.classList.add('jqxButton');
		this.zoomIn.textContent = '放大工作区';
		this.zoomIn.id = 'zoomIn';
		this.viewPageLayoutContent.appendChild(this.zoomIn);
		this.myListener25.value = addDisposableListener(this.zoomIn, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.zoomIn') });

		this.zoomOut = document.createElement('a');
		this.zoomOut.classList.add('jqxButton');
		this.zoomOut.textContent = '缩小工作区';
		this.zoomOut.id = 'zoomOut';
		this.viewPageLayoutContent.appendChild(this.zoomOut);
		this.myListener26.value = addDisposableListener(this.zoomOut, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.zoomOut') });

		this.zoomReset = document.createElement('a');
		this.zoomReset.classList.add('jqxButton');
		this.zoomReset.textContent = '重置缩放';
		this.zoomReset.id = 'zoomReset';
		this.viewPageLayoutContent.appendChild(this.zoomReset);
		this.myListener27.value = addDisposableListener(this.zoomReset, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.zoomReset') });

		this.splitEditor = document.createElement('a');
		this.splitEditor.classList.add('jqxButton');
		this.splitEditor.textContent = '编辑器拆分';
		this.splitEditor.id = 'splitEditor';
		this.viewPageLayoutContent.appendChild(this.splitEditor);
		this.myListener28.value = addDisposableListener(this.splitEditor, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.splitEditor') });


		this.viewPageLayout.appendChild(this.viewPageLayoutContent);

		this.viewPageLayoutText = document.createElement('div');
		this.viewPageLayoutText.textContent = '布局';
		this.viewPageLayoutText.classList.add('bottom-text');
		this.viewPageLayout.appendChild(this.viewPageLayoutText);

		this.viewPageLayout.appendChild(this.viewPageLayoutText);

		this.viewPage.appendChild(this.viewPageLayout);
		//视图-显示
		this.viewPageDisplay = document.createElement('div');
		this.viewPageDisplay.classList.add('sub-homePage');

		this.viewPageDisplayContent = document.createElement('div');
		this.viewPageDisplayContent.classList.add('button-container');

		this.toggleSidebarVisibility = document.createElement('a');
		this.toggleSidebarVisibility.classList.add('jqxButton');
		this.toggleSidebarVisibility.textContent = '切换侧边栏';
		this.toggleSidebarVisibility.id = 'toggleSidebarVisibility';
		this.viewPageDisplayContent.appendChild(this.toggleSidebarVisibility);
		this.myListener29.value = addDisposableListener(this.toggleSidebarVisibility, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.toggleSidebarVisibility') });

		this.toggleActivityBarVisibility = document.createElement('a');
		this.toggleActivityBarVisibility.classList.add('jqxButton');
		this.toggleActivityBarVisibility.textContent = '切换活动栏';
		this.toggleActivityBarVisibility.id = 'toggleActivityBarVisibility';
		this.viewPageDisplayContent.appendChild(this.toggleActivityBarVisibility);
		this.myListener30.value = addDisposableListener(this.toggleActivityBarVisibility, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.toggleActivityBarVisibility') });

		this.toggleStatusbarVisibility = document.createElement('a');
		this.toggleStatusbarVisibility.classList.add('jqxButton');
		this.toggleStatusbarVisibility.textContent = '切换状态栏';
		this.toggleStatusbarVisibility.id = 'toggleStatusbarVisibility';
		this.viewPageDisplayContent.appendChild(this.toggleStatusbarVisibility);
		this.myListener31.value = addDisposableListener(this.toggleStatusbarVisibility, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.toggleStatusbarVisibility') });

		this.togglePanel = document.createElement('a');
		this.togglePanel.classList.add('jqxButton');
		this.togglePanel.textContent = '切换面板';
		this.togglePanel.id = 'togglePanel';
		this.viewPageDisplayContent.appendChild(this.togglePanel);
		this.myListener32.value = addDisposableListener(this.togglePanel, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.togglePanel') });

		this.toggleEditorGroupLayout = document.createElement('a');
		this.toggleEditorGroupLayout.classList.add('jqxButton');
		this.toggleEditorGroupLayout.textContent = '切换编辑器群组';
		this.toggleEditorGroupLayout.id = 'toggleEditorGroupLayout';
		this.viewPageDisplayContent.appendChild(this.toggleEditorGroupLayout);
		this.myListener33.value = addDisposableListener(this.toggleEditorGroupLayout, EventType.CLICK, () => { this.commandService.executeCommand('workbench.action.toggleEditorGroupLayout') });


		this.viewPageDisplay.appendChild(this.viewPageDisplayContent);

		this.viewPageDisplayText = document.createElement('div');
		this.viewPageDisplayText.textContent = '显示';
		this.viewPageDisplayText.classList.add('bottom-text');
		this.viewPageDisplay.appendChild(this.viewPageDisplayText);

		this.viewPage.appendChild(this.viewPageDisplay);


		this.viewPageP.appendChild(this.viewPage);


		// 将页面添加到表格页面容器
		this.jqxContent.appendChild(this.homePageP);
		this.jqxContent.appendChild(this.appPageP);
		this.jqxContent.appendChild(this.viewPageP);


		this.myJS = document.createElement('script');
		this.myJS.src = ('./resource/renderer.js');
		this.element.appendChild(this.myJS);


		this.leftContent = append(this.rootContainer, $('.titlebar-left'));
		this.centerContent = append(this.rootContainer, $('.titlebar-center'));
		this.rightContent = append(this.rootContainer, $('.titlebar-right'));

		// App Icon (Native Windows/Linux and Web)
		if (!isMacintosh && !isWeb && !hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
			this.appIcon = prepend(this.leftContent, $('a.window-appicon'));

			// Web-only home indicator and menu (not for auxiliary windows)
			if (!this.isAuxiliary && isWeb) {
				const homeIndicator = this.environmentService.options?.homeIndicator;
				if (homeIndicator) {
					const icon: ThemeIcon = getIconRegistry().getIcon(homeIndicator.icon) ? { id: homeIndicator.icon } : Codicon.code;

					this.appIcon.setAttribute('href', homeIndicator.href);
					this.appIcon.classList.add(...ThemeIcon.asClassNameArray(icon));
					this.appIconBadge = document.createElement('div');
					this.appIconBadge.classList.add('home-bar-icon-badge');
					this.appIcon.appendChild(this.appIconBadge);
				}
			}
		}

		// Draggable region that we can manipulate for #52522
		this.dragRegion = prepend(this.rootContainer, $('div.titlebar-drag-region'));

		// Menubar: install a custom menu bar depending on configuration
		if (
			!this.isAuxiliary &&
			!hasNativeTitlebar(this.configurationService, this.titleBarStyle) &&
			(!isMacintosh || isWeb) &&
			this.currentMenubarVisibility !== 'compact'
		) {
			this.installMenubar();
		}

		// Title
		this.title = append(this.centerContent, $('div.window-title'));
		this.createTitle();

		// Create Toolbar Actions
		if (hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
			this.actionToolBarElement = append(this.rightContent, $('div.action-toolbar-container'));
			this.createActionToolBar();
			this.createActionToolBarMenus();
		}

		let primaryControlLocation = isMacintosh ? 'left' : 'right';
		if (isMacintosh && isNative) {

			// Check if the locale is RTL, macOS will move traffic lights in RTL locales
			// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/textInfo

			const localeInfo = new Intl.Locale(platformLocale) as any;
			if (localeInfo?.textInfo?.direction === 'rtl') {
				primaryControlLocation = 'right';
			}
		}

		if (!hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
			this.primaryWindowControls = append(primaryControlLocation === 'left' ? this.leftContent : this.rightContent, $('div.window-controls-container.primary'));
			append(primaryControlLocation === 'left' ? this.rightContent : this.leftContent, $('div.window-controls-container.secondary'));
		}

		// Context menu over title bar: depending on the OS and the location of the click this will either be
		// the overall context menu for the entire title bar or a specific title context menu.
		// Windows / Linux: we only support the overall context menu on the title bar
		// macOS: we support both the overall context menu and the title context menu.
		//        in addition, we allow Cmd+click to bring up the title context menu.
		{
			this._register(addDisposableListener(this.rootContainer, EventType.CONTEXT_MENU, e => {
				EventHelper.stop(e);

				let targetMenu: MenuId;
				if (isMacintosh && isHTMLElement(e.target) && isAncestor(e.target, this.title)) {
					targetMenu = MenuId.TitleBarTitleContext;
				} else {
					targetMenu = MenuId.TitleBarContext;
				}

				this.onContextMenu(e, targetMenu);
			}));

			if (isMacintosh) {
				this._register(addDisposableListener(this.title, EventType.MOUSE_DOWN, e => {
					if (e.metaKey) {
						EventHelper.stop(e, true /* stop bubbling to prevent command center from opening */);

						this.onContextMenu(e, MenuId.TitleBarTitleContext);
					}
				}, true /* capture phase to prevent command center from opening */));
			}
		}

		this.updateStyles();

		return this.element;
	}

	private createTitle(): void {
		this.titleDisposables.clear();

		// Text Title
		if (!this.isCommandCenterVisible) {
			this.title.innerText = this.windowTitle.value;
			this.titleDisposables.add(this.windowTitle.onDidChange(() => {
				this.title.innerText = this.windowTitle.value;
			}));
		}

		// Menu Title
		else {
			const commandCenter = this.instantiationService.createInstance(CommandCenterControl, this.windowTitle, this.hoverDelegate);
			reset(this.title, commandCenter.element);
			this.titleDisposables.add(commandCenter);
		}
	}

	private actionViewItemProvider(action: IAction, options: IBaseActionViewItemOptions): IActionViewItem | undefined {

		// --- Activity Actions
		if (!this.isAuxiliary) {
			if (action.id === GLOBAL_ACTIVITY_ID) {
				return this.instantiationService.createInstance(SimpleGlobalActivityActionViewItem, { position: () => HoverPosition.BELOW }, options);
			}
			if (action.id === ACCOUNTS_ACTIVITY_ID) {
				return this.instantiationService.createInstance(SimpleAccountActivityActionViewItem, { position: () => HoverPosition.BELOW }, options);
			}
		}

		// --- Editor Actions
		const activeEditorPane = this.editorGroupsContainer.activeGroup?.activeEditorPane;
		if (activeEditorPane && activeEditorPane instanceof EditorPane) {
			const result = activeEditorPane.getActionViewItem(action, options);

			if (result) {
				return result;
			}
		}

		// Check extensions
		return createActionViewItem(this.instantiationService, action, { ...options, menuAsChild: false });
	}

	private getKeybinding(action: IAction): ResolvedKeybinding | undefined {
		const editorPaneAwareContextKeyService = this.editorGroupsContainer.activeGroup?.activeEditorPane?.scopedContextKeyService ?? this.contextKeyService;

		return this.keybindingService.lookupKeybinding(action.id, editorPaneAwareContextKeyService);
	}

	private createActionToolBar() {

		// Creates the action tool bar. Depends on the configuration of the title bar menus
		// Requires to be recreated whenever editor actions enablement changes

		this.actionToolBarDisposable.clear();

		this.actionToolBar = this.actionToolBarDisposable.add(this.instantiationService.createInstance(WorkbenchToolBar, this.actionToolBarElement, {
			contextMenu: MenuId.TitleBarContext,
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: localize('ariaLabelTitleActions', "Title actions"),
			getKeyBinding: action => this.getKeybinding(action),
			overflowBehavior: { maxItems: 9, exempted: [ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID, ...EDITOR_CORE_NAVIGATION_COMMANDS] },
			anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
			telemetrySource: 'titlePart',
			highlightToggledItems: this.editorActionsEnabled, // Only show toggled state for editor actions (Layout actions are not shown as toggled)
			actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
			hoverDelegate: this.hoverDelegate
		}));

		if (this.editorActionsEnabled) {
			this.actionToolBarDisposable.add(this.editorGroupsContainer.onDidChangeActiveGroup(() => this.createActionToolBarMenus({ editorActions: true })));
		}
	}

	private createActionToolBarMenus(update: true | { editorActions?: boolean; layoutActions?: boolean; activityActions?: boolean } = true) {
		if (update === true) {
			update = { editorActions: true, layoutActions: true, activityActions: true };
		}

		const updateToolBarActions = () => {
			const actions: IToolbarActions = { primary: [], secondary: [] };

			// --- Editor Actions
			if (this.editorActionsEnabled) {
				this.editorActionsChangeDisposable.clear();

				const activeGroup = this.editorGroupsContainer.activeGroup;
				if (activeGroup) {
					const editorActions = activeGroup.createEditorActions(this.editorActionsChangeDisposable);

					actions.primary.push(...editorActions.actions.primary);
					actions.secondary.push(...editorActions.actions.secondary);

					this.editorActionsChangeDisposable.add(editorActions.onDidChange(() => updateToolBarActions()));
				}
			}

			// --- Layout Actions
			if (this.layoutToolbarMenu) {
				createAndFillInActionBarActions(
					this.layoutToolbarMenu,
					{},
					actions,
					() => !this.editorActionsEnabled // Layout Actions in overflow menu when editor actions enabled in title bar
				);
			}

			// --- Activity Actions
			if (this.activityActionsEnabled) {
				if (isAccountsActionVisible(this.storageService)) {
					actions.primary.push(ACCOUNTS_ACTIVITY_TILE_ACTION);
				}
				actions.primary.push(GLOBAL_ACTIVITY_TITLE_ACTION);
			}

			this.actionToolBar.setActions(prepareActions(actions.primary), prepareActions(actions.secondary));
		};

		// Create/Update the menus which should be in the title tool bar

		if (update.editorActions) {
			this.editorToolbarMenuDisposables.clear();

			// The editor toolbar menu is handled by the editor group so we do not need to manage it here.
			// However, depending on the active editor, we need to update the context and action runner of the toolbar menu.
			if (this.editorActionsEnabled && this.editorService.activeEditor !== undefined) {
				const context: IEditorCommandsContext = { groupId: this.editorGroupsContainer.activeGroup.id };

				this.actionToolBar.actionRunner = new EditorCommandsContextActionRunner(context);
				this.actionToolBar.context = context;
				this.editorToolbarMenuDisposables.add(this.actionToolBar.actionRunner);
			} else {
				this.actionToolBar.actionRunner = new ActionRunner();
				this.actionToolBar.context = undefined;

				this.editorToolbarMenuDisposables.add(this.actionToolBar.actionRunner);
			}
		}

		if (update.layoutActions) {
			this.layoutToolbarMenuDisposables.clear();

			if (this.layoutControlEnabled) {
				this.layoutToolbarMenu = this.menuService.createMenu(MenuId.LayoutControlMenu, this.contextKeyService);

				this.layoutToolbarMenuDisposables.add(this.layoutToolbarMenu);
				this.layoutToolbarMenuDisposables.add(this.layoutToolbarMenu.onDidChange(() => updateToolBarActions()));
			} else {
				this.layoutToolbarMenu = undefined;
			}
		}

		if (update.activityActions) {
			this.activityToolbarDisposables.clear();
			if (this.activityActionsEnabled) {
				this.activityToolbarDisposables.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, this._store)(() => updateToolBarActions()));
			}
		}

		updateToolBarActions();
	}

	override updateStyles(): void {
		super.updateStyles();

		// Part container
		if (this.element) {
			if (this.isInactive) {
				this.element.classList.add('inactive');
			} else {
				this.element.classList.remove('inactive');
			}

			const titleBackground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND, (color, theme) => {
				// LCD Rendering Support: the title bar part is a defining its own GPU layer.
				// To benefit from LCD font rendering, we must ensure that we always set an
				// opaque background color. As such, we compute an opaque color given we know
				// the background color is the workbench background.
				return color.isOpaque() ? color : color.makeOpaque(WORKBENCH_BACKGROUND(theme));
			}) || '';
			this.element.style.backgroundColor = titleBackground;

			if (this.appIconBadge) {
				this.appIconBadge.style.backgroundColor = titleBackground;
			}

			if (titleBackground && Color.fromHex(titleBackground).isLighter()) {
				this.element.classList.add('light');
			} else {
				this.element.classList.remove('light');
			}

			const titleForeground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND);
			this.element.style.color = titleForeground || '';

			const titleBorder = this.getColor(TITLE_BAR_BORDER);
			this.element.style.borderBottom = titleBorder ? `1px solid ${titleBorder}` : '';
		}
	}

	protected onContextMenu(e: MouseEvent, menuId: MenuId): void {
		const event = new StandardMouseEvent(getWindow(this.element), e);

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => event,
			menuId,
			contextKeyService: this.contextKeyService,
			domForShadowRoot: isMacintosh && isNative ? event.target : undefined
		});
	}

	protected get currentMenubarVisibility(): MenuBarVisibility {
		if (this.isAuxiliary) {
			return 'hidden';
		}

		return getMenuBarVisibility(this.configurationService);
	}

	private get layoutControlEnabled(): boolean {
		return !this.isAuxiliary && this.configurationService.getValue<boolean>(LayoutSettings.LAYOUT_ACTIONS) !== false;
	}

	protected get isCommandCenterVisible() {
		return this.configurationService.getValue<boolean>(LayoutSettings.COMMAND_CENTER) !== false;
	}

	private get editorActionsEnabled(): boolean {
		return this.editorGroupService.partOptions.editorActionsLocation === EditorActionsLocation.TITLEBAR ||
			(
				this.editorGroupService.partOptions.editorActionsLocation === EditorActionsLocation.DEFAULT &&
				this.editorGroupService.partOptions.showTabs === EditorTabsMode.NONE
			);
	}

	private get activityActionsEnabled(): boolean {
		const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
		return !this.isAuxiliary && (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM);
	}

	get hasZoomableElements(): boolean {
		const hasMenubar = !(this.currentMenubarVisibility === 'hidden' || this.currentMenubarVisibility === 'compact' || (!isWeb && isMacintosh));
		const hasCommandCenter = this.isCommandCenterVisible;
		const hasToolBarActions = this.layoutControlEnabled || this.editorActionsEnabled || this.activityActionsEnabled;
		return hasMenubar || hasCommandCenter || hasToolBarActions;
	}

	get preventZoom(): boolean {
		// Prevent zooming behavior if any of the following conditions are met:
		// 1. Shrinking below the window control size (zoom < 1)
		// 2. No custom items are present in the title bar

		return getZoomFactor(getWindow(this.element)) < 1 || !this.hasZoomableElements;
	}

	override layout(width: number, height: number): void {
		this.updateLayout(new Dimension(width, height));

		super.layoutContents(width, height);
	}

	private updateLayout(dimension: Dimension): void {
		this.lastLayoutDimensions = dimension;

		if (hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
			const zoomFactor = getZoomFactor(getWindow(this.element));

			this.element.style.setProperty('--zoom-factor', zoomFactor.toString());
			this.rootContainer.classList.toggle('counter-zoom', this.preventZoom);

			if (this.customMenubar) {
				const menubarDimension = new Dimension(0, dimension.height);
				this.customMenubar.layout(menubarDimension);
			}
		}
	}

	focus(): void {
		if (this.customMenubar) {
			this.customMenubar.toggleFocus();
		} else {
			(this.element.querySelector('[tabindex]:not([tabindex="-1"])') as HTMLElement).focus();
		}
	}

	toJSON(): object {
		return {
			type: Parts.TITLEBAR_PART
		};
	}

	override dispose(): void {
		this._onWillDispose.fire();

		super.dispose();
	}
}

export class MainBrowserTitlebarPart extends BrowserTitlebarPart {

	constructor(
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService commandService: ICommandService,
	) {
		super(Parts.TITLEBAR_PART, mainWindow, 'main', contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorGroupService, editorService, menuService, keybindingService, commandService);
	}
}

export interface IAuxiliaryTitlebarPart extends ITitlebarPart, IView {
	readonly container: HTMLElement;
	readonly height: number;
}

export class AuxiliaryBrowserTitlebarPart extends BrowserTitlebarPart implements IAuxiliaryTitlebarPart {

	private static COUNTER = 1;

	get height() { return this.minimumHeight; }

	constructor(
		readonly container: HTMLElement,
		editorGroupsContainer: IEditorGroupsContainer,
		private readonly mainTitlebar: BrowserTitlebarPart,

		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
		@IMenuService menuService: IMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService commandService: ICommandService,
	) {
		const id = AuxiliaryBrowserTitlebarPart.COUNTER++;
		super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), editorGroupsContainer, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorGroupService, editorService, menuService, keybindingService, commandService);
	}

	override get preventZoom(): boolean {

		// Prevent zooming behavior if any of the following conditions are met:
		// 1. Shrinking below the window control size (zoom < 1)
		// 2. No custom items are present in the main title bar
		// The auxiliary title bar never contains any zoomable items itself,
		// but we want to match the behavior of the main title bar.

		return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
	}
}

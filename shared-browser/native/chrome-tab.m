#import <AppKit/AppKit.h>
#import <ScriptingBridge/ScriptingBridge.h>
#import <Carbon/Carbon.h>
#import <libproc.h>
#import <sys/sysctl.h>
#import <unistd.h>
static void result(NSDictionary *value,int code){NSData *d=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];fwrite(d.bytes,1,d.length,stdout);fputc('\n',stdout);exit(code);}
static void fail(NSString *code){result(@{@"error":code},1);}
@interface EventErrors:NSObject<SBApplicationDelegate>
@property NSInteger code;
@end
@implementation EventErrors
-(id)eventDidFail:(const AppleEvent*)event withError:(NSError*)error{self.code=error.code;return nil;}
@end
int main(int argc,const char**argv){@autoreleasepool{
 if(argc<6||argc>8)fail(@"EXPLICIT_OWNED_TARGET_REQUIRED");BOOL requestPermission=NO,permissionOnly=NO;for(int i=6;i<argc;i++){if(strcmp(argv[i],"--request-permission")==0)requestPermission=YES;else if(strcmp(argv[i],"--permission-only")==0)permissionOnly=YES;else fail(@"UNSUPPORTED_SETUP_ARGUMENT");}pid_t pid=atoi(argv[1]),parent=atoi(argv[2]);NSString *profile=[NSString stringWithUTF8String:argv[3]],*windowId=[NSString stringWithUTF8String:argv[4]],*marker=[NSString stringWithUTF8String:argv[5]];
 if(parent!=getppid()||pid<2)fail(@"INVALID_BROWSER_PARENT");struct proc_bsdinfo info;int n=proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&info,sizeof(info));if(n!=sizeof(info)||info.pbi_ppid!=parent)fail(@"BROWSER_NOT_OWNED_BY_SERVICE");
 char executable[PROC_PIDPATHINFO_MAXSIZE];if(proc_pidpath(pid,executable,sizeof(executable))<=0||![[NSString stringWithUTF8String:executable] hasSuffix:@"/Google Chrome.app/Contents/MacOS/Google Chrome"])fail(@"NOT_AGENT_GOOGLE_CHROME");
 int mib[3]={CTL_KERN,KERN_PROCARGS2,pid};size_t size=0;if(sysctl(mib,3,NULL,&size,NULL,0)!=0)fail(@"BROWSER_ARGS_UNAVAILABLE");char *args=malloc(size);if(sysctl(mib,3,args,&size,NULL,0)!=0)fail(@"BROWSER_ARGS_UNAVAILABLE");int count=*(int*)args;char *cursor=args+sizeof(int),*end=args+size;cursor+=strnlen(cursor,end-cursor)+1;while(cursor<end&&!*cursor)cursor++;BOOL matched=NO;NSString *expected=[@"--user-data-dir=" stringByAppendingString:profile];for(int i=0;i<count&&cursor<end;i++){NSString *arg=[NSString stringWithUTF8String:cursor];if([arg isEqualToString:expected])matched=YES;cursor+=strnlen(cursor,end-cursor)+1;}free(args);if(!matched)fail(@"AGENT_PROFILE_MISMATCH");
 NSString *pattern=@"^about:blank#anodhas-[a-f0-9-]{36}$";if([marker rangeOfString:pattern options:NSRegularExpressionSearch].location==NSNotFound)fail(@"BLANK_TARGET_MARKER_REQUIRED");
 AEDesc target;OSStatus created=AECreateDesc(typeKernelProcessID,&pid,sizeof(pid),&target);if(created!=noErr)fail(@"INVALID_APPLE_EVENT_TARGET");OSStatus allowed=AEDeterminePermissionToAutomateTarget(&target,typeWildCard,typeWildCard,requestPermission);AEDisposeDesc(&target);if(allowed!=noErr)fail(@"CHROME_WINDOW_AUTOMATION_PERMISSION_REQUIRED");if(permissionOnly)result(@{@"permission":@YES,@"tabCreated":@NO},0);
 SBApplication *app=[SBApplication applicationWithProcessIdentifier:pid];EventErrors *errors=[EventErrors new];app.delegate=errors;app.launchFlags=kLSLaunchDontSwitch|kLSLaunchDontAddToRecents;if(!app.isRunning)fail(@"AGENT_BROWSER_NOT_RUNNING");app.timeout=3;app.sendMode=kAEWaitReply|kAENeverInteract|kAEDontRecord;
 @try{SBElementArray *windows=[app valueForKey:@"windows"];id window=nil;for(id candidate in windows){id identifier=[candidate valueForKey:@"id"];if([[identifier description] isEqualToString:windowId]){window=candidate;break;}}if(errors.code)fail(@"CHROME_SCRIPTING_READ_FAILED");if(!window)fail(@"OWNED_CHROME_WINDOW_NOT_FOUND");Class type=[app classForScriptingClass:@"tab"];id tab=[[type alloc]initWithProperties:@{}];SBElementArray *tabs=[window valueForKey:@"tabs"];[tabs addObject:tab];if(errors.code)result(@{@"error":@"CHROME_BACKGROUND_TAB_FAILED",@"nativeCode":@(errors.code),@"stage":@"create-tab"},1);result(@{@"created":@YES,@"nativeTabId":[[tab valueForKey:@"id"] description]?:@"",@"activated":@NO},0);} @catch(NSException *error){result(@{@"error":@"CHROME_BACKGROUND_TAB_FAILED",@"exception":error.name,@"stage":@"create-tab"},1);}
 }return 0;}

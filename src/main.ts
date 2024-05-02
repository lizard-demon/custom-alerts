import { Devvit, MenuItem, Context, TriggerContext, MenuItemOnPressEvent } from '@devvit/public-api';
import { PostCreate, PostV2 } from '@devvit/protos';

Devvit.configure({
    redditAPI: true,
    kvStore: true,
});

async function getSubscribed(context: TriggerContext): Promise<string[]> {
    const subscribed = await context.redis.hgetall("subscribed");
    if(!subscribed) {
        return [];
    }

    return Object.keys(subscribed);
}

async function addSubscription(context: Context, user: string): Promise<void> {
    await context.redis.hset("subscribed", { [user]: "" });
}

async function deleteSubscription(context: Context, user: string): Promise<void> {
    await context.redis.hdel("subscribed", [user]);
}

async function subscribeHandler(event: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
    const userID = context.userId;
    if(!userID) {
        context.ui.showToast({
            appearance: 'neutral',
            text: "You must be logged in to use this app."
        });
    }

    const user = await context.reddit.getUserById(userID!);
    if(!user) {
        context.ui.showToast({
            appearance: 'neutral',
            text: "Couldn't fetch user."
        });
    }

    await addSubscription(context, user.username.toLowerCase());
    context.ui.showToast({
        appearance: 'success',
        text: "You have subscribed to new posts from this subreddit."
    });
}

async function unsubscribeHandler(_: MenuItemOnPressEvent, context: Devvit.Context): Promise<void> {
    const userID = context.userId;
    if(!userID) {
        context.ui.showToast({
            appearance: 'neutral',
            text: "You must be logged in to use this app."
        });
    }

    const user = await context.reddit.getUserById(userID!);
    if(!user) {
        context.ui.showToast({
            appearance: 'neutral',
            text: "Couldn't fetch user."
        });
    }

    await deleteSubscription(context, user.username.toLowerCase());
    context.ui.showToast({
        appearance: 'success',
        text: "You will no longer receive notifications about new posts from this subreddit."
    });
}

const menuItems: MenuItem[] = [
    {
        location: "subreddit",
        onPress: subscribeHandler,
        label: "Get Notified for New Posts",
        description: "Receive notifications about new posts in this subreddit."
    },
    {
        location: "subreddit",
        onPress: unsubscribeHandler,
        label: "Stop Getting New Post Notifications",
        description: "Stop receiving notifications about new posts in this subreddit."
    }
];

menuItems.forEach((action) => {
    Devvit.addMenuItem(action);
});

async function generateMessageBody(context: TriggerContext, post: PostV2, url: string): Promise<string> {
    const author = await context.reddit.getUserById(post.authorId);

    return `Author: u/${author.username}\n\nTitle: ${post.title}\n\n________\n\n${url}`  
}

Devvit.addTrigger({
    event: 'PostCreate',
    async onEvent(postSubmit: PostCreate, context: TriggerContext): Promise<void> {
        const subscribed = await getSubscribed(context);
        if(postSubmit.post === undefined) {
            return;
        }

        const postId = postSubmit.post.id.substring(3);
        const subreddit = await context.reddit.getSubredditById(postSubmit.post.subredditId);
        const subredditName = subreddit.name;
        const url = `https://www.reddit.com/r/${subredditName}/comments/${postId}/_/`;
        const body = await generateMessageBody(context, postSubmit.post, url);

        subscribed.forEach((username) => {
            context.reddit.sendPrivateMessage({
                to: username,
                subject: `A new post has been made in r/${subredditName}`,
                text: body,
            });
        });
    }
});

export default Devvit;

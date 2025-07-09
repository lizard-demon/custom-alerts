import { Devvit, Context, TriggerContext, MenuItemOnPressEvent } from '@devvit/public-api';
import { PostCreate } from '@devvit/protos';

Devvit.configure({
    redditAPI: true,
    kvStore: true,
});

const SUBSCRIPTIONS_KEY = "subscribed_users";

const createSubscriptionHandler = (
    updateSubscription: (username: string, context: Context) => Promise<unknown>,
    successToast: string
): (event: MenuItemOnPressEvent, context: Context) => Promise<void> => {
    return async (_, context) => {
        const { userId, reddit, ui } = context;
        if (!userId) {
            ui.showToast({ appearance: 'neutral', text: "You must be logged in to subscribe." });
            return;
        }
        try {
            const user = await reddit.getUserById(userId);
            await updateSubscription(user.username.toLowerCase(), context);
            ui.showToast({ appearance: 'success', text: successToast });
        } catch (error) {
            console.error('Subscription handler failed:', error);
            ui.showToast({ appearance: 'neutral', text: "An error occurred. Please try again." });
        }
    };
};

Devvit.addMenuItem({
    location: "subreddit",
    label: "Notify Me of New Posts",
    description: "Get a PM when a new post is made in this subreddit.",
    onPress: createSubscriptionHandler(
        (username, context) => context.redis.hset(SUBSCRIPTIONS_KEY, { [username]: "" }),
        "Subscribed! You'll get a message for new posts."
    ),
});

Devvit.addMenuItem({
    location: "subreddit",
    label: "Stop New Post Notifications",
    description: "Stop receiving PMs about new posts.",
    onPress: createSubscriptionHandler(
        (username, context) => context.redis.hdel(SUBSCRIPTIONS_KEY, [username]),
        "Unsubscribed. You will no longer receive notifications."
    ),
});

Devvit.addTrigger({
    event: 'PostCreate',
    async onEvent({ post }: PostCreate, context: TriggerContext) {
        if (!post) {
            console.log("PostCreate event received without post data.");
            return;
        }

        const subscribers = Object.keys(await context.redis.hgetall(SUBSCRIPTIONS_KEY) ?? {});
        if (subscribers.length === 0) {
            return; // No one to notify.
        }

        const [author, subreddit] = await Promise.all([
            context.reddit.getUserById(post.authorId),
            context.reddit.getSubredditById(post.subredditId),
        ]);

        const subject = `New Post in r/${subreddit.name}`;
        const body = `u/${author.username} posted: "${post.title}"\n\nhttps://www.reddit.com${post.permalink}`;
        const messagePromises = subscribers.map(username =>
            context.reddit.sendPrivateMessage({
                to: username,
                subject,
                text: body,
            })
        );
        await Promise.all(messagePromises);
        console.log(`Notified ${subscribers.length} users about post ${post.id}.`);
    },
});

export default Devvit;

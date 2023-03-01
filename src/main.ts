import { Devvit, SubredditContextActionEvent, Context, RedditAPIClient, getFromMetadata, Header } from '@devvit/public-api';
import { InternalDevvit } from '@devvit/public-api/abstractions/InternalDevvit.js'
import { Metadata, ContextActionResponse, KeySet, MessageSet, ListFilter, PostSubmit, PostV2 } from '@devvit/protos';

const kvstore = Devvit.use(Devvit.Types.KVStore);
const reddit = new RedditAPIClient();

async function getSubscribed(): Promise<string[]> {
    const data = await kvstore.List(ListFilter.fromPartial({
        filter: "*",
    }));

    return data.keys;
}

async function addSubscription(user: string): Promise<void> {
    await kvstore.Put(MessageSet.fromPartial({
        messages: {
            [user]: "",
        }
    }));
}

async function deleteSubscription(user: string): Promise<void> {
    await kvstore.Del(KeySet.fromPartial({
        keys: [user],
    }));
}

async function subscribeHandler(_: SubredditContextActionEvent, metadata?: Metadata | undefined): Promise<ContextActionResponse> {
    const userID = getFromMetadata(Header.User, metadata);
    if(userID === undefined) {
        return ContextActionResponse.fromPartial({
            success: false,
            message: "You must be logged in to use this app."
        });
    }

    const user = await reddit.getUserById(userID, metadata);
    if(user === undefined) {
        return ContextActionResponse.fromPartial({
            success: false,
            message: "Couldn't fetch user."
        }); 
    }

    await addSubscription(user.username.toLowerCase());

    return ContextActionResponse.fromPartial({
        success: true,
        message: "You have subscribed to new posts from this subreddit."
    });
}

async function unsubscribeHandler(_: SubredditContextActionEvent, metadata?: Metadata | undefined): Promise<ContextActionResponse> {
    const userID = getFromMetadata(Header.User, metadata);
    if(userID === undefined) {
        return ContextActionResponse.fromPartial({
            success: false,
            message: "You must be logged in to use this app."
        });
    }

    const user = await reddit.getUserById(userID, metadata);
    if(user === undefined) {
        return ContextActionResponse.fromPartial({
            success: false,
            message: "Couldn't fetch user."
        }); 
    }

    await deleteSubscription(user.username.toLowerCase());

    return ContextActionResponse.fromPartial({
        success: true,
        message: "You will no longer receive notifications about new posts from this subreddit."
    })
}

Devvit.addActions([
    {
        context: Context.SUBREDDIT,
        handler: subscribeHandler,
        name: "Get Notified for New Posts",
        description: "Receive notifications about new posts in this subreddit."
    },
    {
        context: Context.SUBREDDIT,
        handler: unsubscribeHandler,
        name: "Stop Getting New Post Notifications",
        description: "Stop receiving notifications about new posts in this subreddit."
    }
]);

async function generateMessageBody(post: PostV2, url: string, metadata: Metadata | undefined): Promise<string> {
    const author = await reddit.getUserById(post.authorId, metadata);

    return `Author: u/${author.username}\n\nTitle: ${post.title}\n\n________\n\n${url}`  
}

InternalDevvit.onPostSubmit(async (postSubmit: PostSubmit, metdata?: Metadata | undefined): Promise<{}> => {
    const subscribed = await getSubscribed();
    if(postSubmit.post === undefined) {
        return {};
    }

    const postId = postSubmit.post.id.substring(3);
    const subreddit = await reddit.getSubredditById(postSubmit.post.subredditId, metdata);
    const subredditName = subreddit.name;
    const url = `https://www.reddit.com/r/${subredditName}/comments/${postId}/_/`;
    const body = await generateMessageBody(postSubmit.post, url, metdata);

    subscribed.forEach((username) => {
        reddit.sendPrivateMessage({
            to: username,
            subject: `A new post has been made in r/${subredditName}`,
            text: body,
        }, metdata);
    });

    return {};
})

export default Devvit;
